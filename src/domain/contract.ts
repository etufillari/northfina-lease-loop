// Locking a contract (docs/DECISIONS.md): the quote's price-list version and all derived
// amounts freeze at signing — later price-list changes never touch them. VAT is NOT locked.
// A quote is valid through the end of the next calendar day (scenario card 2: quoted
// Thu 5 Nov on list v1, signed Fri 6 Nov when v2 is live → the v1 price holds).
import { addDays, addMonthsClamped } from './calendar';
import { QUOTE_VALID_DAYS } from './holds';
import type { Quote } from './pricing';

/** A lease may start at most this many months after signing. */
export const MAX_START_MONTHS_AHEAD = 3;

/**
 * The day a lease starts. The start date approved at submission stands (the decision, e.g. the
 * age rule, was made on it), and a signing request cannot pick another one. Only when that day
 * has already passed by the time the customer signs (quoted Thursday, signed Friday) does the
 * lease start on the signing day, the earliest it can. Applications without an approved date
 * (none in practice) use the requested one.
 */
export function signingStartDate(input: {
  approved: string | null;
  requested: string;
  signedDate: string;
}): string {
  if (input.approved === null) return input.requested;
  return input.approved < input.signedDate ? input.signedDate : input.approved;
}

export type Contract = {
  quote: Quote;
  /** The day the quote was made; its price list is the one that is locked. */
  quoteDate: string;
  priceListVersion: number;
  signedDate: string;
  startDate: string;
  /** From q_usage_purpose; delivery use changes the end-of-term check. */
  usagePurpose: string | null;
};

export type LockResult =
  | { ok: true; contract: Contract }
  | { ok: false; reason: 'quote_expired' | 'start_before_signing' | 'start_too_far_ahead' };

export function lockContract(input: {
  quote: Quote;
  quoteDate: string;
  priceListVersion: number;
  signedDate: string;
  startDate: string;
  usagePurpose?: string | null;
}): LockResult {
  if (input.signedDate > addDays(input.quoteDate, QUOTE_VALID_DAYS)) {
    return { ok: false, reason: 'quote_expired' };
  }
  if (input.startDate < input.signedDate) return { ok: false, reason: 'start_before_signing' };
  if (input.startDate > addMonthsClamped(input.signedDate, MAX_START_MONTHS_AHEAD)) {
    return { ok: false, reason: 'start_too_far_ahead' };
  }
  return {
    ok: true,
    contract: {
      quote: input.quote,
      quoteDate: input.quoteDate,
      priceListVersion: input.priceListVersion,
      signedDate: input.signedDate,
      startDate: input.startDate,
      usagePurpose: input.usagePurpose ?? null,
    },
  };
}
