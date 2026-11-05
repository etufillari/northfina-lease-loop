// Dates typed by people as day/month/year, converted to and from ISO (`YYYY-MM-DD`).
// Only the UI edge uses the typed form; every answer and every domain function uses ISO.

const TYPED = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Parses "31/12/1990" into "1990-12-31", or returns null if it is not a real calendar date.
 * The day comes first. `/`, `.` and `-` are accepted as separators ("31.12.1990" is how Finns
 * write it); the day and month may have one digit; the year must have four.
 */
export function parseDayMonthYear(input: string): string | null {
  const match = TYPED.exec(input.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "1990-12-31" → "31/12/1990". Anything that is not an ISO date is returned unchanged. */
export function formatDayMonthYear(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}
