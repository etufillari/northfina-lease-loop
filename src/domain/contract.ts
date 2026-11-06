import { isoDateSchema } from '@/data/schemas';

export type ContractDates = {
  startsOn: string;
  endsOn: string;
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Calculates the calendar boundary of a lease without consulting the clock.
 * The end date is the anniversary boundary after the final lease month. If the
 * target month has no matching day, its last day is used (for example, Jan 31
 * plus one month becomes Feb 28 or Feb 29).
 */
export function contractDatesFor(startOn: string, termMonths: number): ContractDates {
  if (!isoDateSchema.safeParse(startOn).success) {
    throw new RangeError(`startOn must be a valid ISO date, got "${startOn}"`);
  }
  if (!Number.isSafeInteger(termMonths) || termMonths <= 0) {
    throw new RangeError(`termMonths must be a positive whole number, got ${termMonths}`);
  }

  const year = Number(startOn.slice(0, 4));
  const month = Number(startOn.slice(5, 7));
  const day = Number(startOn.slice(8, 10));
  const targetMonthIndex = year * 12 + (month - 1) + termMonths;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  const endsOn = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

  return { startsOn: startOn, endsOn };
}
