// Calendar arithmetic on ISO dates. UTC is used only as a calculator, so time zones and
// daylight saving can never shift a date.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS_PER_YEAR = 12;

/** True for the `YYYY-MM-DD` shape. It does not check that the day exists. */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

/** Splits an ISO date. A date in another shape is a bug in the caller, so it throws. */
export function dateParts(isoDate: string): { year: number; month: number; day: number } {
  if (!isIsoDate(isoDate)) {
    throw new RangeError(`date must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  return {
    year: Number(isoDate.slice(0, 4)),
    month: Number(isoDate.slice(5, 7)),
    day: Number(isoDate.slice(8, 10)),
  };
}

function toIso(utcMillis: number): string {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = dateParts(isoDate);
  return toIso(Date.UTC(year, month - 1, day + days));
}

/**
 * The same day `months` later, or the last day of that month if it is shorter: 31 Jan + 1
 * month is 28 Feb. Always count from the original date, never from an earlier result, or a
 * clamped day sticks: 31 Jan + 2 months is 31 Mar, but 28 Feb + 1 month is 28 Mar.
 */
export function addMonths(isoDate: string, months: number): string {
  const { year, month, day } = dateParts(isoDate);
  const monthIndex = year * MONTHS_PER_YEAR + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / MONTHS_PER_YEAR);
  const targetMonth = monthIndex - targetYear * MONTHS_PER_YEAR;
  const lastDay = daysInMonth(targetYear, targetMonth + 1);
  return toIso(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

/** How many days a month has. `month` counts from 1, so 2 is February. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
