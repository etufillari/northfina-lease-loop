// VAT: which rate applies on a day. Compute the VAT itself with percentOfCents (money.ts),
// so every amount in the app follows the same rounding rule.
import type { VatRates } from '@/data/schemas';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The VAT rate in percent (e.g. 25.5) on `isoDate`, or `null` if no rate covers that day.
 * Both ends of a rate's validity are inclusive; `valid_to: null` means "still valid".
 */
export function vatPercentOn(vatRates: VatRates, isoDate: string): number | null {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  return rate ? rate.rate_percent : null;
}
