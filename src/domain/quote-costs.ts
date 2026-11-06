// What a quote costs with VAT. Pure, so the price sliders can show it without asking the server.
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { forecastCost, withVatChanges, type CostForecast, type VatChange } from './invoicing';
import { calculateQuote, type AssetQuote, type QuoteFailureReason } from './pricing';
import type { VatAmounts } from './vat';

/** A quote plus what it costs with VAT if the lease started on the quote date. */
export type PricedQuote = AssetQuote &
  Omit<CostForecast, 'invoices'> & {
    /** The first month's rent with VAT. This is the amount to test affordability against. */
    firstRent: VatAmounts;
    /** The first invoice at a new VAT rate during the term, or null if the rate stays. */
    firstVatChange: (VatChange & { invoiceDate: string }) | null;
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

  const changed = withVatChanges(invoices).find((invoice) => invoice.vatChange !== null);
  const firstVatChange = changed?.vatChange
    ? { ...changed.vatChange, invoiceDate: changed.invoiceDate }
    : null;
  return { ok: true, quote: { ...quote, ...costs, firstRent, firstVatChange } };
}

export type LeaseChoice = {
  assetId: string;
  onDate: string;
  listPriceCents: number;
  priceListVersion: number;
  downPaymentCents: number;
  termMonths: number;
};

export type LeaseChoiceResult =
  | { ok: true; quote: PricedQuote }
  | { ok: false; reason: QuoteFailureReason | 'no_vat_rate_on_date' };

/**
 * Prices what the customer picked on the sliders. The list price is already known, so this
 * needs no price lists and can run on every slider move. The server repeats the calculation
 * when a quote is saved, so what the browser shows is never what gets stored.
 */
export function priceLeaseChoice(
  table: CoefficientTable,
  vatRates: VatRates,
  choice: LeaseChoice
): LeaseChoiceResult {
  const { assetId, onDate, priceListVersion, ...input } = choice;
  const result = calculateQuote(table, input);
  if (!result.ok) return result;
  return priceQuote({ ...result.quote, assetId, quotedOn: onDate, priceListVersion }, vatRates);
}
