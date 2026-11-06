// The VAT rate in force on a date (decision D2): the invoice date picks the rate.
import type { VatRates } from '@/data/schemas';
import { percentToBasisPoints } from './money-math';

export type VatRateResult =
  | { ok: true; rateBasisPoints: number; percent: number; validFrom: string }
  | { ok: false; reason: 'no_rate_on_date' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Finds the rate whose `valid_from` … `valid_to` range contains `isoDate`. Both ends are
 * inclusive and a `null` `valid_to` means open-ended. ISO dates compare correctly as strings.
 * A date outside every range is a normal answer (`no_rate_on_date`); a malformed date is a bug
 * and throws a RangeError.
 */
export function vatRateOn(rates: VatRates, isoDate: string): VatRateResult {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must be YYYY-MM-DD, got ${isoDate}`);
  }
  const rate = rates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_rate_on_date' };
  return {
    ok: true,
    rateBasisPoints: percentToBasisPoints(rate.rate_percent),
    percent: rate.rate_percent,
    validFrom: rate.valid_from,
  };
}
