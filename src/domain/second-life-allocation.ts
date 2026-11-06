// Shares the whole returns desk out in one pass, on top of the frozen `secondLifeDecision`.
//
// Two rules the single-item decision cannot see:
// 1. One person, one offer. Items are decided in desk order (asset id) and a waiter who wins
//    one is gone from the list for the next, so the desk never shows the same person winning
//    two cards.
// 2. Pooling for multi-item entries. When the first-come winner of an item wants several
//    (wait-08: three office laptops), the item is held for them instead of being offered.
//    They stay at the top of the list, so the next suitable items are pooled for them too, and
//    the whole set is offered together once the pool is full. Their budget is compared with
//    the rent of ONE item: the per-item reading of `max_monthly_net_rent_cents` that the
//    frozen matcher already uses (whether it is per item or for the set is still open).
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import {
  matchWaitingList,
  secondLifeDecision,
  type SecondLifeDecision,
  type WaiterVerdict,
} from './second-life';

export type DeskItem = { asset: Asset; originalListPriceCents: number };

export type DeskOutcome =
  | { kind: 'offer'; waiterId: string }
  /** Held for a multi-item waiter: `filled` of `quantity` are pooled once this one is. */
  | { kind: 'pool'; waiterId: string; filled: number; quantity: number }
  /** This item fills the pool: every pooled item is offered to the waiter together. */
  | { kind: 'complete_pool'; waiterId: string; quantity: number }
  | { kind: 'list_available' }
  | { kind: 'parts_bin' };

/** The outcomes that hand an item to someone on the waiting list. */
export type WinnerOutcome = Extract<DeskOutcome, { waiterId: string }>;

export type DeskAllocation = {
  assetId: string;
  decision: SecondLifeDecision;
  outcome: DeskOutcome;
};

/**
 * The waiting-list queue for one pass: hands a winner their item (or the next item of their
 * set) and takes them off the list once they are served.
 */
function waitingQueue(
  demand: readonly SecondLifeRequest[],
  pooled: Readonly<Record<string, number>>
) {
  let remaining = [...demand];
  const filled: Record<string, number> = { ...pooled };
  return {
    remaining: () => remaining,
    assign(winner: SecondLifeRequest): WinnerOutcome {
      const leave = () => {
        remaining = remaining.filter((w) => w.id !== winner.id);
      };
      if (winner.quantity <= 1) {
        leave();
        return { kind: 'offer', waiterId: winner.id };
      }
      const count = (filled[winner.id] ?? 0) + 1;
      filled[winner.id] = count;
      if (count >= winner.quantity) {
        leave();
        return { kind: 'complete_pool', waiterId: winner.id, quantity: winner.quantity };
      }
      return { kind: 'pool', waiterId: winner.id, filled: count, quantity: winner.quantity };
    },
  };
}

/**
 * @param items     the returned assets with their v1 price, in any order
 * @param demand    waiters still waiting (already-offered people left out by the caller)
 * @param pooled    items already held per waiter id from earlier desk runs
 */
export function allocateDesk(
  items: readonly DeskItem[],
  input: {
    asOfDate: string;
    demand: readonly SecondLifeRequest[];
    pooled: Readonly<Record<string, number>>;
  },
  data: { curves: ResidualCurves; costs: RefurbishmentCosts; table: CoefficientTable }
): DeskAllocation[] {
  const ordered = [...items].sort((a, b) => a.asset.id.localeCompare(b.asset.id));
  const queue = waitingQueue(input.demand, input.pooled);

  return ordered.map(({ asset, originalListPriceCents }) => {
    const decision = secondLifeDecision(
      { asset, originalListPriceCents, asOfDate: input.asOfDate },
      { ...data, demand: queue.remaining() }
    );
    const winner = queue.remaining().find((w) => w.id === decision.winnerId);
    if (!winner) {
      const kind = decision.action === 'parts_bin' ? 'parts_bin' : 'list_available';
      return { assetId: asset.id, decision, outcome: { kind } };
    }
    return { assetId: asset.id, decision, outcome: queue.assign(winner) };
  });
}

/** An item already refurbished and priced by the desk, looking for its next person. */
export type RefurbishedItem = {
  assetId: string;
  category: AssetCategory;
  condition: AssetCondition;
  /** The desk's second-life price: what the next lease finances. */
  financedCents: number;
};

export type HandoverAllocation = {
  assetId: string;
  outcome: WinnerOutcome | { kind: 'list_available' };
  considered: WaiterVerdict[];
};

/**
 * Passes refurbished items on when an offer ends (declined, expired, or a pool released): no
 * new refurbishment and no re-pricing, just the next person in line at the price the desk
 * set, with the same one-offer-per-person and pooling rules as the desk.
 */
export function allocateRefurbished(
  items: readonly RefurbishedItem[],
  input: {
    asOfDate: string;
    demand: readonly SecondLifeRequest[];
    pooled: Readonly<Record<string, number>>;
  },
  table: CoefficientTable
): HandoverAllocation[] {
  const ordered = [...items].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const queue = waitingQueue(input.demand, input.pooled);

  return ordered.map((item) => {
    const match = matchWaitingList(
      {
        category: item.category,
        condition: item.condition,
        financedCents: item.financedCents,
        asOfDate: input.asOfDate,
      },
      queue.remaining(),
      table
    );
    if (!match.winner) {
      return {
        assetId: item.assetId,
        outcome: { kind: 'list_available' },
        considered: match.considered,
      };
    }
    return {
      assetId: item.assetId,
      outcome: queue.assign(match.winner),
      considered: match.considered,
    };
  });
}
