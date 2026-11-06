// VAT follows the invoice date, never the signing date: that is what lets a contract keep
// its locked net rent while the amount the customer pays changes with the law.
import type { VatRates } from '@/data/schemas';
import { assertIsoDate } from './calendar';
import { percentOf } from './money';

export type VatRateResult =
  { ok: true; ratePercent: number } | { ok: false; reason: 'no_vat_rate_on_date' };

/** The VAT rate in force on `isoDate`. Both ends of a rate's validity are included. */
export function vatRateOn(vatRates: VatRates, isoDate: string): VatRateResult {
  assertIsoDate(isoDate);
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  return rate
    ? { ok: true, ratePercent: rate.rate_percent }
    : { ok: false, reason: 'no_vat_rate_on_date' };
}

export type VatAmounts = {
  netCents: number;
  vatRatePercent: number;
  vatCents: number;
  grossCents: number;
};

/** Net, VAT and gross for one invoice. VAT is rounded here, per invoice, and nowhere else. */
export function vatAmounts(netCents: number, vatRatePercent: number): VatAmounts {
  const vatCents = percentOf(netCents, vatRatePercent);
  return { netCents, vatRatePercent, vatCents, grossCents: netCents + vatCents };
}
