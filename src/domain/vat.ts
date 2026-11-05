// VAT is charged at the rate valid on the invoice date, not the date the price was agreed.
import type { VatRates } from '@/data/schemas';
import { roundHalfUp } from './money';

export type VatRateResult =
  { ok: true; ratePercent: number } | { ok: false; reason: 'no_rate_on_date' };

export interface VatBreakdown {
  netCents: number;
  vatCents: number;
  grossCents: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The VAT rate (percent, e.g. 25.5) valid on `isoDate`. Both ends of a period are included. */
export function vatRateOn(rates: VatRates, isoDate: string): VatRateResult {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`isoDate must look like YYYY-MM-DD, got "${isoDate}"`);
  }
  const rate = rateValidOn(rates, isoDate);
  return rate
    ? { ok: true, ratePercent: rate.rate_percent }
    : { ok: false, reason: 'no_rate_on_date' };
}

/** The day the VAT rate valid on `isoDate` took effect, or null when no rate covers it. */
export function vatRateValidFrom(rates: VatRates, isoDate: string): string | null {
  return rateValidOn(rates, isoDate)?.valid_from ?? null;
}

function rateValidOn(rates: VatRates, isoDate: string) {
  // ISO dates sort like the days they name, so string comparison is date comparison.
  return rates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
}

/** Adds VAT to a net amount. VAT is rounded once, half up (D-005); gross = net + VAT exactly. */
export function withVat(netCents: number, ratePercent: number): VatBreakdown {
  if (!Number.isInteger(netCents)) {
    throw new RangeError(`netCents must be whole cents, got ${netCents}`);
  }
  const vatCents = roundHalfUp((netCents * ratePercent) / 100);
  return { netCents, vatCents, grossCents: netCents + vatCents };
}
