// The demo "as of" date (D-030): which day the app treats as today. Pure: the server reads the
// cookie and the clock and passes both in.
import { isIsoDate } from './calendar';

/** The first price list is valid from this day; before it nothing can be priced. */
export const AS_OF_MIN = '2026-01-01';
/** Far enough for a 48-month lease signed in 2031 to reach its end of term. */
export const AS_OF_MAX = '2035-12-31';

export type AsOfParse =
  { ok: true; date: string } | { ok: false; reason: 'not_a_date' | 'out_of_range' };

/** Accepts only a real `YYYY-MM-DD` date between `AS_OF_MIN` and `AS_OF_MAX`, both included. */
export function parseAsOfDate(value: unknown): AsOfParse {
  if (typeof value !== 'string' || !isIsoDate(value)) return { ok: false, reason: 'not_a_date' };
  // ISO dates of the same length sort as strings.
  if (value < AS_OF_MIN || value > AS_OF_MAX) return { ok: false, reason: 'out_of_range' };
  return { ok: true, date: value };
}

export type EffectiveToday = {
  /** The date every page and route uses as today. */
  date: string;
  /** The real calendar date in Helsinki. */
  realToday: string;
  /** True when `date` is not the real date, so the UI shows a banner. */
  isDemo: boolean;
};

/** A valid demo date wins; anything else (missing, tampered, out of range) means the real date. */
export function effectiveToday(demoDate: string | undefined, realToday: string): EffectiveToday {
  const parsed = parseAsOfDate(demoDate);
  const date = parsed.ok ? parsed.date : realToday;
  return { date, realToday, isDemo: date !== realToday };
}
