// The inputs of the residual curve for one item (D60, D31, D11), shared by the assessment of a
// returned item and the exit of a lease, so the two can never value the same item differently
// (review finding 1): an exit of a relisted item used its second-life contract price, already
// a depreciated value, and aged it a second time.
//
// - Ours from new: the pack counts no past life and the item has a contract in our books. The
//   curve starts from its FIRST contract's list price and that contract's start day (D31), on
//   every later lease too: a second lease of card 1's bike is valued as a 2026 bike first leased
//   on 2026-11-05, not as a new bike again (review finding 3).
// - Otherwise (past lives the pack only counts, or no contract): the earliest price list that
//   lists the item, aged by D11 from its model year (`previousLives` at least 1 picks D11).
//
// `livesSoFar` is the item's life count: the pack's `previous_lives` plus every contract of ours
// that has ended (every status but `active`). The pack's number never moves; this one does.
import type { PriceList } from '@/data/schemas';
import type { CurveAgeInput } from '../residual/age';
import type { ContractStatus } from '../statuses';

/** The net list price at the first lease of an item the pack lists: the lowest version's. */
export function firstLeaseListPriceCents(
  priceLists: readonly PriceList[],
  assetId: string
): number | null {
  const listed = [...priceLists]
    .sort((a, b) => a.version - b.version)
    .find((list) => list.prices[assetId] !== undefined);
  return listed ? listed.prices[assetId]! : null;
}

export type FirstLeaseCurveInput = {
  assetId: string;
  modelYear: number;
  /** The pack's `previous_lives`. */
  previousLives: number;
  /** This asset's contracts, oldest signing first. */
  contracts: readonly { startDate: string; unitListPriceCents: number }[];
  priceLists: readonly PriceList[];
  /** The valuation day: only a placeholder lease start under D11, which ignores it. */
  today: string;
};

export type FirstLeaseCurve = { listPriceCents: number; age: CurveAgeInput };

/** The curve's list price and age inputs (D60), or null when no price is known. */
export function firstLeaseCurve(input: FirstLeaseCurveInput): FirstLeaseCurve | null {
  const first = input.contracts[0];
  if (input.previousLives === 0 && first !== undefined) {
    return {
      listPriceCents: first.unitListPriceCents,
      age: { modelYear: input.modelYear, previousLives: 0, leaseStart: first.startDate },
    };
  }
  const listPriceCents = firstLeaseListPriceCents(input.priceLists, input.assetId);
  if (listPriceCents === null) return null;
  return {
    listPriceCents,
    age: {
      modelYear: input.modelYear,
      previousLives: Math.max(1, input.previousLives),
      leaseStart: input.today,
    },
  };
}

export type Lives = {
  /** Lives before the current or next one: the pack's count plus our ended contracts. */
  previousLives: number;
  /** The life the item is in (leased) or will start (on the shelf), from 1. */
  currentLife: number;
};

export function livesSoFar(
  packPreviousLives: number,
  contracts: readonly { status: ContractStatus }[]
): Lives {
  const ended = contracts.filter((c) => c.status !== 'active').length;
  const previousLives = packPreviousLives + ended;
  return { previousLives, currentLife: previousLives + 1 };
}
