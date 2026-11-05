// Calendar rules for leases (docs/DECISIONS.md): due dates stay anchored to the start day
// and are clamped to the last day of shorter months, never shifted permanently.
// 2026-01-31 + 1 month = 2026-02-28, but + 2 months = 2026-03-31 again.
// Pure string/number math: ISO dates compare and sort correctly as strings.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  const base = DAYS_IN_MONTH[month - 1];
  if (base === undefined) throw new RangeError(`month must be 1-12, got ${month}`);
  return month === 2 && isLeapYear(year) ? 29 : base;
}

function parseIso(isoDate: string): { year: number; month: number; day: number } {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`expected YYYY-MM-DD, got "${isoDate}"`);
  }
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`"${isoDate}" is not a calendar date`);
  }
  return { year, month, day };
}

function toIso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`;
}

/**
 * `startIso` plus `months` whole months, anchored to the start day: the day of month is kept
 * and only clamped when the target month is shorter. Clamping never sticks, because every
 * call counts from the original start date.
 */
export function addMonthsClamped(startIso: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be a non-negative integer, got ${months}`);
  }
  const start = parseIso(startIso);
  const monthIndex = start.year * 12 + (start.month - 1) + months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(start.day, daysInMonth(year, month));
  return toIso(year, month, day);
}

/** The calendar day before `isoDate`. A period from the 5th ends on the 4th. */
export function previousDay(isoDate: string): string {
  const { year, month, day } = parseIso(isoDate);
  if (day > 1) return toIso(year, month, day - 1);
  if (month > 1) return toIso(year, month - 1, daysInMonth(year, month - 1));
  return toIso(year - 1, 12, 31);
}
