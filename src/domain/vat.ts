// VAT is never locked: each invoice uses the rate valid on its due date (docs/DECISIONS.md).
// Rates are handled as integer basis points (25.5 % = 2550) so the maths stays exact.
import type { VatRates } from '@/data/schemas';
import { divideHalfUp } from './rounding';

export type VatRateResult =
  | { ok: true; ratePercent: number; rateBasisPoints: number; fictional: boolean }
  | { ok: false; reason: 'no_vat_rate_on_date' };

/** The VAT rate valid on `isoDate` (ranges include both ends; `valid_to: null` is open). */
export function vatRateOn(vatRates: VatRates, isoDate: string): VatRateResult {
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_vat_rate_on_date' };
  return {
    ok: true,
    ratePercent: rate.rate_percent,
    rateBasisPoints: Math.round(rate.rate_percent * 100),
    fictional: rate.fictional ?? false,
  };
}

/** VAT on `netCents` at `rateBasisPoints` (2550 = 25.5 %), rounded half-up per invoice. */
export function vatCents(netCents: number, rateBasisPoints: number): number {
  return divideHalfUp(netCents * rateBasisPoints, 10000);
}

/** Net plus VAT. */
export function grossCents(netCents: number, rateBasisPoints: number): number {
  return netCents + vatCents(netCents, rateBasisPoints);
}
