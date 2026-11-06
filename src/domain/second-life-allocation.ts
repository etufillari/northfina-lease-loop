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
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { secondLifeDecision, type SecondLifeDecision } from './second-life';

export type DeskItem = { asset: Asset; originalListPriceCents: number };

export type DeskOutcome =
  | { kind: 'offer'; waiterId: string }
  /** Held for a multi-item waiter: `filled` of `quantity` are pooled once this one is. */
  | { kind: 'pool'; waiterId: string; filled: number; quantity: number }
  /** This item fills the pool: every pooled item is offered to the waiter together. */
  | { kind: 'complete_pool'; waiterId: string; quantity: number }
  | { kind: 'list_available' }
  | { kind: 'parts_bin' };

export type DeskAllocation = {
  assetId: string;
  decision: SecondLifeDecision;
  outcome: DeskOutcome;
};

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
  let remaining = [...input.demand];
  const filled: Record<string, number> = { ...input.pooled };

  return ordered.map(({ asset, originalListPriceCents }) => {
    const decision = secondLifeDecision(
      { asset, originalListPriceCents, asOfDate: input.asOfDate },
      { ...data, demand: remaining }
    );
    const winner = remaining.find((w) => w.id === decision.winnerId);
    if (!winner) {
      const kind = decision.action === 'parts_bin' ? 'parts_bin' : 'list_available';
      return { assetId: asset.id, decision, outcome: { kind } };
    }

    const leave = () => {
      remaining = remaining.filter((w) => w.id !== winner.id);
    };
    if (winner.quantity <= 1) {
      leave();
      return { assetId: asset.id, decision, outcome: { kind: 'offer', waiterId: winner.id } };
    }
    const count = (filled[winner.id] ?? 0) + 1;
    filled[winner.id] = count;
    if (count >= winner.quantity) {
      leave();
      return {
        assetId: asset.id,
        decision,
        outcome: { kind: 'complete_pool', waiterId: winner.id, quantity: winner.quantity },
      };
    }
    return {
      assetId: asset.id,
      decision,
      outcome: { kind: 'pool', waiterId: winner.id, filled: count, quantity: winner.quantity },
    };
  });
}
