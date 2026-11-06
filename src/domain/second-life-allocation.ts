// Shares the whole returns desk out in one pass, on top of `secondLifeDecision`.
//
// Two rules the single-item decision cannot see:
// 1. One person, one offer. Items are decided in desk order (asset id) and a waiter who wins
//    one is gone from the list for the next, so the desk never shows the same person winning
//    two cards.
// 2. Sets are offered whole, and nothing is held back for them. A waiter who wants several
//    (wait-08: three office laptops) wins an item only when the rest of their set is free at
//    the same moment: refurbished items already listed in the catalogue (the "shelf") that fit
//    them too. Then the item and its partners are offered together. Otherwise they are skipped
//    for this item, which goes to the next person in line straight away. Their budget is
//    compared with the rent of ONE item (the per-item reading the matcher uses).
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

/** An item already refurbished and priced by the desk. */
export type RefurbishedItem = {
  assetId: string;
  category: AssetCategory;
  condition: AssetCondition;
  /** The desk's second-life price: what the next lease finances. */
  financedCents: number;
};

export type OfferOutcome = {
  kind: 'offer';
  waiterId: string;
  /** Free items offered together with this one to complete a multi-item set, by asset id. */
  withAssetIds: string[];
};

export type DeskOutcome = OfferOutcome | { kind: 'list_available' } | { kind: 'parts_bin' };

export type DeskAllocation = {
  assetId: string;
  decision: SecondLifeDecision;
  outcome: DeskOutcome;
};

const byJoinOrder = (a: WaiterVerdict, b: WaiterVerdict) =>
  a.joinedOn.localeCompare(b.joinedOn) || a.id.localeCompare(b.id);

/**
 * The waiting-list queue for one pass. `free` is everything that can complete a set: the
 * shelf, plus (for a hand-over) the batch's own items.
 */
function waitingQueue(
  demand: readonly SecondLifeRequest[],
  free: readonly RefurbishedItem[],
  asOfDate: string,
  table: CoefficientTable
) {
  let remaining = [...demand];
  let pool = [...free].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const fits = (item: RefurbishedItem, waiter: SecondLifeRequest) =>
    matchWaitingList(
      {
        category: item.category,
        condition: item.condition,
        financedCents: item.financedCents,
        asOfDate,
      },
      [waiter],
      table
    ).winner !== null;
  return {
    remaining: () => remaining,
    /** The free items that complete `winner`'s set with one more item, or null if too few. */
    partners(winner: SecondLifeRequest, besides: string): string[] | null {
      if (winner.quantity <= 1) return [];
      const matching = pool.filter((item) => item.assetId !== besides && fits(item, winner));
      return matching.length >= winner.quantity - 1
        ? matching.slice(0, winner.quantity - 1).map((item) => item.assetId)
        : null;
    },
    assign(winner: SecondLifeRequest, withAssetIds: string[]): OfferOutcome {
      remaining = remaining.filter((w) => w.id !== winner.id);
      pool = pool.filter((item) => !withAssetIds.includes(item.assetId));
      return { kind: 'offer', waiterId: winner.id, withAssetIds };
    },
    take(assetId: string) {
      pool = pool.filter((item) => item.assetId !== assetId);
    },
    putBack(item: RefurbishedItem) {
      pool = [...pool, item].sort((a, b) => a.assetId.localeCompare(b.assetId));
    },
  };
}

/** A waiter skipped because their set cannot be completed now, with this item's rent. */
function setIncomplete(winner: SecondLifeRequest, considered: WaiterVerdict[]): WaiterVerdict {
  const rent = considered.find((v) => v.id === winner.id)?.monthlyNetRentCents;
  return {
    id: winner.id,
    joinedOn: winner.joined_on,
    outcome: 'set_incomplete',
    ...(rent === undefined ? {} : { monthlyNetRentCents: rent }),
  };
}

/**
 * @param items   the returned assets with their v1 price, in any order
 * @param demand  waiters still waiting (already-offered people left out by the caller)
 * @param shelf   refurbished items listed and free right now: they can complete a set
 */
export function allocateDesk(
  items: readonly DeskItem[],
  input: {
    asOfDate: string;
    demand: readonly SecondLifeRequest[];
    shelf: readonly RefurbishedItem[];
  },
  data: { curves: ResidualCurves; costs: RefurbishmentCosts; table: CoefficientTable }
): DeskAllocation[] {
  const ordered = [...items].sort((a, b) => a.asset.id.localeCompare(b.asset.id));
  const queue = waitingQueue(input.demand, input.shelf, input.asOfDate, data.table);

  return ordered.map(({ asset, originalListPriceCents }) => {
    const skipped: WaiterVerdict[] = [];
    let demand = queue.remaining();
    for (;;) {
      const decision = secondLifeDecision(
        { asset, originalListPriceCents, asOfDate: input.asOfDate },
        { ...data, demand }
      );
      const winner = demand.find((w) => w.id === decision.winnerId);
      const withSkipped = { ...decision, considered: [...decision.considered, ...skipped] };
      withSkipped.considered.sort(byJoinOrder);
      if (!winner) {
        const kind = decision.action === 'parts_bin' ? 'parts_bin' : 'list_available';
        return { assetId: asset.id, decision: withSkipped, outcome: { kind } };
      }
      const partners = queue.partners(winner, asset.id);
      if (partners) {
        return {
          assetId: asset.id,
          decision: withSkipped,
          outcome: queue.assign(winner, partners),
        };
      }
      skipped.push(setIncomplete(winner, decision.considered));
      demand = demand.filter((w) => w.id !== winner.id);
    }
  });
}

export type HandoverAllocation = {
  assetId: string;
  /** `in_set`: offered as part of the set led by another item of the same batch. */
  outcome: OfferOutcome | { kind: 'in_set'; waiterId: string } | { kind: 'list_available' };
  considered: WaiterVerdict[];
};

/**
 * Passes refurbished items on when an offer ends (declined or expired): no new refurbishment
 * and no re-pricing, just the next person in line at the price the desk set, with the same
 * one-offer-per-person and whole-set rules as the desk. The batch's own items can complete a
 * set too, so a declined set of three can go straight to the next person who wants three.
 */
export function allocateRefurbished(
  items: readonly RefurbishedItem[],
  input: {
    asOfDate: string;
    demand: readonly SecondLifeRequest[];
    shelf: readonly RefurbishedItem[];
  },
  table: CoefficientTable
): HandoverAllocation[] {
  const ordered = [...items].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const queue = waitingQueue(input.demand, [...input.shelf, ...ordered], input.asOfDate, table);
  const results = new Map<string, HandoverAllocation>();

  for (const item of ordered) {
    if (results.has(item.assetId)) continue;
    queue.take(item.assetId);
    const skipped: WaiterVerdict[] = [];
    let demand = queue.remaining();
    for (;;) {
      const match = matchWaitingList(
        {
          category: item.category,
          condition: item.condition,
          financedCents: item.financedCents,
          asOfDate: input.asOfDate,
        },
        demand,
        table
      );
      const considered = [...match.considered, ...skipped].sort(byJoinOrder);
      if (!match.winner) {
        // Listed: it is on the shelf now, so a later item's set may still take it.
        queue.putBack(item);
        results.set(item.assetId, {
          assetId: item.assetId,
          outcome: { kind: 'list_available' },
          considered,
        });
        break;
      }
      const partners = queue.partners(match.winner, item.assetId);
      if (partners) {
        const outcome = queue.assign(match.winner, partners);
        results.set(item.assetId, { assetId: item.assetId, outcome, considered });
        for (const partner of partners) {
          if (!ordered.some((i) => i.assetId === partner)) continue;
          const earlier = results.get(partner);
          results.set(partner, {
            assetId: partner,
            outcome: { kind: 'in_set', waiterId: match.winner.id },
            considered: earlier?.considered ?? [],
          });
        }
        break;
      }
      skipped.push(setIncomplete(match.winner, match.considered));
      demand = demand.filter((w) => w.id !== match.winner!.id);
    }
  }
  return ordered.map((item) => results.get(item.assetId)!);
}
