// How long things are held, in one place (docs/DECISIONS.md). A hold made on day D with N
// days is valid THROUGH D + N ("until" is its last valid day) and has lapsed from the day
// after. ISO dates compare as strings, so no clock is needed.
import { addDays } from './calendar';

export const HOLD_DAYS = {
  /** An approved application waits this long for the customer's signature. */
  approval: 7,
  /** An approved company application waits this long for its authorised signatory. */
  signatory: 7,
  /** A waiting-list offer waits this long for an answer; the item is idle meanwhile. */
  waitlistOffer: 3,
  /** An end-of-term nomination keeps the item for the named person this long. */
  nomination: 7,
} as const;

export type HoldKind = keyof typeof HOLD_DAYS;

/**
 * A quote's price is not a hold (nothing is reserved): it is valid on the day it is made and
 * the next day, so a Thursday quote can still be signed on Friday (scenario card 2).
 */
export const QUOTE_VALID_DAYS = 1;

/** The last valid day of a hold of `kind` that starts on `startIso`. */
export function holdUntil(kind: HoldKind, startIso: string): string {
  return addDays(startIso, HOLD_DAYS[kind]);
}

/** True from the day after a hold's last valid day. */
export function isLapsed(until: string, asOf: string): boolean {
  return asOf > until;
}

/** The first day a hold whose last valid day is `until` counts as lapsed. */
export function lapsesOn(until: string): string {
  return addDays(until, 1);
}
