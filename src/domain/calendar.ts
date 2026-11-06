// Calendar arithmetic on ISO dates (`YYYY-MM-DD`), using only integers. Domain code may not
// use `Date`, and this avoids time zones and daylight saving altogether.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(isoDate);
  const [year, month, day] = match ? match.slice(1).map(Number) : [];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new RangeError(`not a real calendar date: "${isoDate}"`);
  }
  return { year, month, day };
}

function formatIsoDate(year: number, month: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/** Throws on anything that is not a real date. Invalid dates are bugs: check them at the API. */
export function assertIsoDate(isoDate: string): void {
  parseIsoDate(isoDate);
}

/**
 * `isoDate` plus `months`, on the same day of the month, or the last day of a shorter month:
 * 31 Jan + 1 month = 28 Feb, and 29 Feb 2028 + 12 months = 28 Feb 2029.
 *
 * Always count from the original date. Stepping from the previous result would lose the day
 * for good: 31 Jan → 28 Feb → 28 Mar, when the March date should be 31 Mar.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be a non-negative whole number, got ${months}`);
  }
  const { year, month, day } = parseIsoDate(isoDate);
  const monthsSinceYearZero = year * 12 + (month - 1) + months;
  const newYear = Math.floor(monthsSinceYearZero / 12);
  const newMonth = (monthsSinceYearZero % 12) + 1;
  return formatIsoDate(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)));
}

/** The calendar day before `isoDate`. */
export function previousDay(isoDate: string): string {
  const { year, month, day } = parseIsoDate(isoDate);
  if (day > 1) return formatIsoDate(year, month, day - 1);
  const newYear = month === 1 ? year - 1 : year;
  const newMonth = month === 1 ? 12 : month - 1;
  return formatIsoDate(newYear, newMonth, daysInMonth(newYear, newMonth));
}
