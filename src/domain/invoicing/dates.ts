// Calendar arithmetic on ISO days (`YYYY-MM-DD`), on year / month / day integers. No clock:
// every date comes in as an argument. Ported from the practice repo's `addMonthsUtc`, rewritten
// without `Date` objects, so a time zone can never shift a day; `addDays` is the shared one.

import { addDays } from '../civil-days';

/** The domain's one Date-free `addDays` (`src/domain/civil-days.ts`), re-exported for invoicing. */
export { addDays };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type YearMonthDay = { year: number; month: number; day: number };

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in `month` (1–12) of `year`: February has 29 in a leap year (2028), 28 otherwise (2100). */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be 1–12, got ${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Splits a real calendar day into integers. A malformed or impossible day is a bug: RangeError. */
export function parseIsoDate(isoDate: string): YearMonthDay {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`isoDate must be YYYY-MM-DD, got ${isoDate}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`isoDate is not a calendar day: ${isoDate}`);
  }
  return { year, month, day };
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');

export function formatIsoDate({ year, month, day }: YearMonthDay): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** True when `isoDate` is `YYYY-MM-DD` and a real day. */
export function isRealIsoDate(isoDate: string): boolean {
  try {
    parseIsoDate(isoDate);
    return true;
  } catch {
    return false;
  }
}

/**
 * `isoDate` plus `months` calendar months, keeping the day of month and clamping it to the
 * last day of a shorter month: 31 Jan + 1 → 28 Feb (29 in a leap year), 31 Jan + 2 → 31 Mar.
 * Each step counts from the original day, so the clamp never accumulates.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  if (!Number.isSafeInteger(months))
    throw new RangeError(`months must be an integer, got ${months}`);
  const { year, month, day } = parseIsoDate(isoDate);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return formatIsoDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/** −1, 0 or 1. Valid ISO days sort as strings; both are checked first. */
export function compareIso(a: string, b: string): -1 | 0 | 1 {
  parseIsoDate(a);
  parseIsoDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The last day of a term of `termMonths` from `startDate`: the day before the same day after the term. */
export function termEndDate(startDate: string, termMonths: number): string {
  return addDays(addMonthsClamped(startDate, termMonths), -1);
}
