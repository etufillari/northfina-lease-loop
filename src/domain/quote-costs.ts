// What a quote costs with VAT. Pure, so the price sliders can show it without asking the server.
import type { VatRates } from '@/data/schemas';
import { forecastCost, type CostForecast } from './invoicing';
import type { AssetQuote } from './pricing';
import type { VatAmounts } from './vat';

/** A quote plus what it costs with VAT if the lease started on the quote date. */
export type PricedQuote = AssetQuote &
  Omit<CostForecast, 'invoices'> & {
    /** The first month's rent with VAT. This is the amount to test affordability against. */
    firstRent: VatAmounts;
  };

export type PricedQuoteResult =
  { ok: true; quote: PricedQuote } | { ok: false; reason: 'no_vat_rate_on_date'; date: string };

/** Adds the VAT figures to a quote, forecast with the VAT rates known today. */
export function priceQuote(quote: AssetQuote, vatRates: VatRates): PricedQuoteResult {
  const result = forecastCost({ ...quote, startDate: quote.quotedOn }, vatRates);
  if (!result.ok) return result;

  const { invoices, ...costs } = result.forecast;
  const firstRent = invoices.find((invoice) => invoice.kind === 'rent');
  // A term is always at least one month: pricing refuses any term the table does not offer.
  if (!firstRent) throw new Error('a schedule always has a rent invoice');
  return { ok: true, quote: { ...quote, ...costs, firstRent } };
}
