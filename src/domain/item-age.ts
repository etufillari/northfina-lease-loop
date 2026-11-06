// How old an item is, in whole months, for every valuation on the residual curve (D-042): early
// exit, second-life pricing and the passport all use this one rule, so the same item on the same
// day has one value. Pure: the dates come in as arguments.

import type { AssetCondition } from '@/data/schemas';
import { addMonthsClamped } from './calendar';

export interface AgeClock {
  modelYear: number;
  /** The start of its first lease, when it was new then with no earlier lives; else null. */
  firstLeasedNewOn: string | null;
}

/**
 * When the item's age clock started: the first lease start of an item we received new and
 * unleased, or null. The data pack has no first-use date, so for anything else we fall back to
 * 1 January of the model year (D-033, D-035).
 */
export function firstLeasedNewOn(
  received: { condition: AssetCondition; previousLives: number },
  firstLeaseStart: string | null
): string | null {
  return received.condition === 'new' && received.previousLives === 0 ? firstLeaseStart : null;
}

/**
 * Whole months old on `isoDate`, never below zero. From the first lease start, a month passes on
 * each clamped anniversary, like the invoice schedule (D-016); from the model year, on each
 * first of the month.
 */
export function itemAgeOn(clock: AgeClock, isoDate: string): number {
  const start = clock.firstLeasedNewOn;
  if (start === null) {
    const [year, month] = isoDate.split('-').map(Number) as [number, number];
    return Math.max(0, (year - clock.modelYear) * 12 + month - 1);
  }
  // ISO dates compare as strings (D-015).
  let months = 0;
  while (addMonthsClamped(start, months + 1) <= isoDate) months++;
  return months;
}
