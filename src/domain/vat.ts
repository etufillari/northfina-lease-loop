// VAT lookup. VAT is never locked: it always follows the invoice date (ARCHITECTURE.md §6.3).
import type { VatRates } from '@/data/schemas';
import { isValidIsoDate } from './calendar';
import { percentToBp } from './rounding';

export type VatRateResult =
  | { ok: true; ratePercent: number; rateBp: number; fictional: boolean }
  | { ok: false; reason: 'no_vat_rate_on_date' };

/**
 * Looks up the general VAT rate in effect on `isoDate` (`YYYY-MM-DD`).
 * Both `valid_from` and `valid_to` are inclusive; `valid_to: null` means open-ended.
 * `rateBp` is the same rate in basis points (25.5 % → 2550), for `mulDivRound`.
 */
export function vatRateOn(vatRates: VatRates, isoDate: string): VatRateResult {
  if (!isValidIsoDate(isoDate)) {
    throw new RangeError(`isoDate must be a real YYYY-MM-DD date, got "${isoDate}"`);
  }

  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_vat_rate_on_date' };

  return {
    ok: true,
    ratePercent: rate.rate_percent,
    rateBp: percentToBp(rate.rate_percent),
    fictional: Boolean(rate.fictional),
  };
}
