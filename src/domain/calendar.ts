// Calendar arithmetic on ISO dates (YYYY-MM-DD), in UTC so time zones and DST can't shift a day.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Parses an ISO date to UTC milliseconds; throws on a malformed or impossible date (a bug). */
function toUtcMs(isoDate: string): number {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  if (toIso(ms) !== isoDate) throw new RangeError(`${isoDate} is not a real date`);
  return ms;
}

function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** The date `days` days after `isoDate` (before it, when negative). */
export function addDays(isoDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`days must be whole, got ${days}`);
  return toIso(toUtcMs(isoDate) + days * MS_PER_DAY);
}

/**
 * The date `months` whole months after `isoDate`, on the same day of the month, or the last day
 * of the target month when it is shorter (31 Jan + 1 → 28 Feb). Always count from the original
 * start date, never chain calls, so 31 Jan + 2 is 31 Mar, not 28 Mar.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be a whole number ≥ 0, got ${months}`);
  }
  const start = new Date(toUtcMs(isoDate));
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toIso(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
}
