import { isoDateSchema } from '@/data/schemas';

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDate(value: string): CalendarDate {
  if (!isoDateSchema.safeParse(value).success) {
    throw new RangeError(`date must be a valid ISO date, got "${value}"`);
  }

  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function formatDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function assertMonthOffset(monthOffset: number): void {
  if (!Number.isSafeInteger(monthOffset) || monthOffset < 0) {
    throw new RangeError(`monthOffset must be a non-negative whole number, got ${monthOffset}`);
  }
}

/** Returns true when the date is the final calendar day of its month. */
export function isMonthEnd(date: string): boolean {
  const parsed = parseDate(date);
  return parsed.day === daysInMonth(parsed.year, parsed.month);
}

/** Adds calendar months without consulting the clock, clamping missing days. */
export function addMonthsClamped(
  date: string,
  monthOffset: number,
  preserveMonthEnd = isMonthEnd(date)
): string {
  const parsed = parseDate(date);
  assertMonthOffset(monthOffset);

  const targetMonthIndex = parsed.year * 12 + (parsed.month - 1) + monthOffset;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const targetDays = daysInMonth(targetYear, targetMonth);
  const targetDay = preserveMonthEnd ? targetDays : Math.min(parsed.day, targetDays);

  return formatDate({ year: targetYear, month: targetMonth, day: targetDay });
}

/** Counts the whole calendar months from `start` to `end`. */
export function wholeMonthsBetween(start: string, end: string): number {
  const from = parseDate(start);
  const to = parseDate(end);
  const months = (to.year - from.year) * 12 + to.month - from.month;
  return months - (to.day < from.day ? 1 : 0);
}

/** Adds whole calendar days without using Date or timezone conversion. */
export function addDays(date: string, dayOffset: number): string {
  const parsed = parseDate(date);
  if (!Number.isSafeInteger(dayOffset)) {
    throw new RangeError(`dayOffset must be a whole number, got ${dayOffset}`);
  }

  const direction = dayOffset < 0 ? -1 : 1;
  let remaining = Math.abs(dayOffset);
  let current = parsed;

  while (remaining > 0) {
    let nextDay = current.day + direction;
    let nextMonth = current.month;
    let nextYear = current.year;

    if (nextDay > daysInMonth(current.year, current.month)) {
      nextDay = 1;
      nextMonth += 1;
      if (nextMonth === 13) {
        nextMonth = 1;
        nextYear += 1;
      }
    } else if (nextDay === 0) {
      nextMonth -= 1;
      if (nextMonth === 0) {
        nextMonth = 12;
        nextYear -= 1;
      }
      nextDay = daysInMonth(nextYear, nextMonth);
    }

    current = { year: nextYear, month: nextMonth, day: nextDay };
    remaining -= 1;
  }

  return formatDate(current);
}
