// VAT. A contract locks net rent only; VAT always comes from the rate on the invoice date.
import type { VatRates } from '@/data/schemas';
import { roundedDivide } from './money';

const BASIS_POINTS_PER_WHOLE = 10_000;

export type VatRateResult =
  { ok: true; rateBasisPoints: number } | { ok: false; reason: 'no_vat_rate_on_date' };

/** The VAT rate on `isoDate`, in basis points (25.5 % is 2550). Both range ends are included. */
export function vatRateOn(vatRates: VatRates, isoDate: string): VatRateResult {
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_vat_rate_on_date' };
  return { ok: true, rateBasisPoints: Math.round(rate.rate_percent * 100) };
}

/** VAT on a net amount, rounded half up. */
export function vatCents(netCents: number, rateBasisPoints: number): number {
  return roundedDivide(netCents * rateBasisPoints, BASIS_POINTS_PER_WHOLE);
}
