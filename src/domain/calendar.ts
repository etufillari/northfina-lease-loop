// Calendar arithmetic on YYYY-MM-DD values: no clock reads or local-time-zone dependency.

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isIsoDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function parts(value: string) {
  if (!isIsoDate(value)) throw new RangeError('date must be a real YYYY-MM-DD calendar date');
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function format(year: number, month: number, day: number): string {
  if (year < 1 || year > 9999) throw new RangeError('resulting year is outside 0001..9999');
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Always pass the original start date: Jan 31 + 2 months is Mar 31, never Mar 28. */
export function addMonthsAnchored(date: string, offset: number): string {
  if (!Number.isSafeInteger(offset)) throw new RangeError('month offset must be an integer');
  const { year, month, day } = parts(date);
  const absoluteMonth = year * 12 + month - 1 + offset;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth - targetYear * 12 + 1;
  return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** Adds calendar days in UTC without reading the clock; preserves the existing offset limit. */
export function addDays(date: string, offset: number): string {
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 36600) {
    throw new RangeError('day offset must be an integer between -36600 and 36600');
  }
  const { year, month, day } = parts(date);
  // A local object at a fixed instant: no current time or local-time-zone dependency.
  const result = new Date(0);
  // Unlike Date.UTC(year, ...), setUTCFullYear keeps years 0001..0099 unchanged.
  result.setUTCFullYear(year, month - 1, day + offset);
  return format(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

/** Leap-day policy: in a non-leap year a Feb 29 birthday is reached on March 1. */
export function ageOn(birthDate: string, onDate: string): number {
  const birth = parts(birthDate);
  const on = parts(onDate);
  const birthdayNotReached = onDate.slice(5) < birthDate.slice(5) ? 1 : 0;
  return on.year - birth.year - birthdayNotReached;
}
