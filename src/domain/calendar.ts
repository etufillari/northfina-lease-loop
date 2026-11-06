// Calendar helpers on ISO `YYYY-MM-DD` strings (ARCHITECTURE.md §6.2). Domain dates are
// never JS `Date`: no time zones, no clock. Every function rejects impossible dates such
// as 2026-02-30 with a RangeError.

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True if `year` is a Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`year must be a positive integer, got ${year}`);
  }
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Number of days in a month (1 = January, 12 = December). */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be between 1 and 12, got ${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

type Ymd = { year: number; month: number; day: number };

function parse(isoDate: string): Ymd | null {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

function parseOrThrow(isoDate: string, name = 'isoDate'): Ymd {
  const parsed = parse(isoDate);
  if (!parsed) throw new RangeError(`${name} must be a real YYYY-MM-DD date, got "${isoDate}"`);
  return parsed;
}

function format({ year, month, day }: Ymd): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True if `isoDate` is a real calendar date written as `YYYY-MM-DD`. */
export function isValidIsoDate(isoDate: string): boolean {
  return parse(isoDate) !== null;
}

/** -1, 0 or 1. ISO dates sort as text, but both must be real dates. */
export function compareIso(a: string, b: string): -1 | 0 | 1 {
  parseOrThrow(a, 'a');
  parseOrThrow(b, 'b');
  return a < b ? -1 : a > b ? 1 : 0;
}

// Days since 1970-01-01 and back (H. Hinnant's civil-date algorithms, integers only).
function toDayNumber({ year, month, day }: Ymd): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

function fromDayNumber(dayNumber: number): Ymd {
  const z = dayNumber + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Adds `days` (may be negative) to an ISO date. */
export function addDays(isoDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer, got ${days}`);
  return format(fromDayNumber(toDayNumber(parseOrThrow(isoDate)) + days));
}

/**
 * Adds `monthsToAdd` months, clamping the day to the target month's length. Always
 * count from the original date, never chain, so the day does not drift:
 *   addMonthsClamped('2026-01-31', 1)  → '2026-02-28'
 *   addMonthsClamped('2026-01-31', 2)  → '2026-03-31'
 *   addMonthsClamped('2026-01-31', 25) → '2028-02-29'
 */
export function addMonthsClamped(isoDate: string, monthsToAdd: number): string {
  if (!Number.isInteger(monthsToAdd) || monthsToAdd < 0) {
    throw new RangeError(`monthsToAdd must be a non-negative integer, got ${monthsToAdd}`);
  }
  const { year, month, day } = parseOrThrow(isoDate);
  const totalMonths = year * 12 + (month - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  return format({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/**
 * Whole months from `from` to `to`: the largest k with `addMonthsClamped(from, k) <= to`.
 * So 5 Nov → 4 Dec is 0 months, 5 Nov → 5 Dec is 1, and 31 Jan → 28 Feb is 1.
 */
export function monthsBetween(from: string, to: string): number {
  if (compareIso(to, from) < 0) {
    throw new RangeError(`to (${to}) must not be before from (${from})`);
  }
  const a = parseOrThrow(from);
  const b = parseOrThrow(to);
  const guess = (b.year - a.year) * 12 + (b.month - a.month);
  return addMonthsClamped(from, guess) <= to ? guess : guess - 1;
}
