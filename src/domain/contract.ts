// Spine step 4: the contract. Signing locks the price the customer was quoted in their
// approved application. Later price lists never change a signed contract.
//
// Dates are ISO `YYYY-MM-DD` strings. Calendar maths uses Date.UTC on explicit parts, so it
// never depends on the clock or the server's time zone.

export const QUOTE_VALID_DAYS = 14;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(isoDate: string): [number, number, number] {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toIso(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = parts(isoDate);
  return toIso(year, month, day + days);
}

/**
 * `isoDate` plus `months` calendar months. A day that doesn't exist in the target month is
 * clamped to its last day: 31 Jan + 1 month = 28 Feb (29 Feb in a leap year).
 */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = parts(isoDate);
  const target = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(target / 12);
  const targetMonth = (target % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return toIso(targetYear, targetMonth, Math.min(day, lastDay));
}

/**
 * The lease runs from the signing day for `termMonths` months; the last day is the day
 * before the same date `termMonths` later. 5 Nov 2026 + 36 months → 4 Nov 2029.
 */
export function contractPeriod(
  startDate: string,
  termMonths: number
): { startDate: string; endDate: string } {
  return { startDate, endDate: addDays(addMonths(startDate, termMonths), -1) };
}

export type SignCheck =
  | { ok: true; quoteValidUntil: string }
  | {
      ok: false;
      reason: 'not_approved' | 'quote_expired' | 'signed_before_quote';
      quoteValidUntil: string;
    };

/**
 * Whether an application can be signed on `signDate`. Only an automatically approved
 * application can be signed online (manual review needs a person first), and its quote is
 * valid for QUOTE_VALID_DAYS days after the quote date, both days included.
 */
export function checkSignable(input: {
  decision: string;
  quoteDate: string;
  signDate: string;
}): SignCheck {
  const quoteValidUntil = addDays(input.quoteDate, QUOTE_VALID_DAYS);
  if (input.decision !== 'approved') return { ok: false, reason: 'not_approved', quoteValidUntil };
  const age = daysBetween(input.quoteDate, input.signDate);
  if (age < 0) return { ok: false, reason: 'signed_before_quote', quoteValidUntil };
  if (age > QUOTE_VALID_DAYS) return { ok: false, reason: 'quote_expired', quoteValidUntil };
  return { ok: true, quoteValidUntil };
}

export type ContractStage = 'not_started' | 'active' | 'ended';

/**
 * Where a contract is on `today`: before its start (possible when travelling back in time),
 * running, or past its last day. A lease that ends on 4 Nov has ended on 5 Nov.
 */
export function contractStage(
  contract: { startDate: string; endDate: string },
  today: string
): ContractStage {
  if (today < contract.startDate) return 'not_started';
  if (today > contract.endDate) return 'ended';
  return 'active';
}

/** Short, readable contract number from its id: the first 8 characters, upper case. */
export function contractNumber(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
