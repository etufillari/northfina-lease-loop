import { isoDateSchema } from '@/data/schemas';
import { addMonthsClamped } from './calendar';

export type ContractDates = {
  startsOn: string;
  endsOn: string;
};

/**
 * Calculates the calendar boundary of a lease without consulting the clock.
 * The end date is the anniversary boundary after the final lease month. If the
 * A lease that starts on a month-end stays anchored to month-end (for example,
 * Jan 31 becomes Feb 28 or Feb 29, then Mar 31). Other start days are clamped
 * only when the target month has no matching day.
 */
export function contractDatesFor(startOn: string, termMonths: number): ContractDates {
  if (!isoDateSchema.safeParse(startOn).success) {
    throw new RangeError(`startOn must be a valid ISO date, got "${startOn}"`);
  }
  if (!Number.isSafeInteger(termMonths) || termMonths <= 0) {
    throw new RangeError(`termMonths must be a positive whole number, got ${termMonths}`);
  }

  const endsOn = addMonthsClamped(startOn, termMonths);

  return { startsOn: startOn, endsOn };
}
