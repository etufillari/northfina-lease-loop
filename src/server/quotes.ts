// Live pricing for the sliders, and the persisted Quote row an application starts from.
// All numbers come from the pure domain functions; this file only loads data and stores.
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { maxDownPaymentCents, quoteFor, type Quote } from '@/domain/pricing';
import { listPriceOn } from '@/domain/price-list';
import { grossCents, vatRateOn } from '@/domain/vat';

export type LiveQuote = {
  assetId: string;
  quantity: number;
  asOf: string;
  priceListVersion: number;
  unitListPriceCents: number;
  listPriceCents: number;
  maxDownPaymentCents: number;
  termsMonths: number[];
  quote: Quote;
  vatRatePercent: number;
  monthlyRentWithVatCents: number;
  totalWithVatAtCurrentRateCents: number;
};

export type LiveQuoteResult =
  | { ok: true; live: LiveQuote }
  | {
      ok: false;
      reason:
        | 'unknown_asset'
        | 'no_price_list_on_date'
        | 'no_vat_rate_on_date'
        | 'below_minimum'
        | 'above_maximum'
        | 'unknown_term'
        | 'down_payment_negative'
        | 'down_payment_over_max';
    };

export async function buildLiveQuote(input: {
  assetId: string;
  quantity: number;
  downPaymentCents: number;
  termMonths: number;
  asOf: string;
}): Promise<LiveQuoteResult> {
  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  const price = listPriceOn(priceLists, input.assetId, input.asOf);
  if (!price.ok) return { ok: false, reason: price.reason };
  const listPriceCents = price.priceCents * input.quantity;

  const result = quoteFor({
    listPriceCents,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
    table,
  });
  if (!result.ok) return { ok: false, reason: result.reason };

  const vat = vatRateOn(vatRates, input.asOf);
  if (!vat.ok) return { ok: false, reason: vat.reason };

  return {
    ok: true,
    live: {
      assetId: input.assetId,
      quantity: input.quantity,
      asOf: input.asOf,
      priceListVersion: price.priceListVersion,
      unitListPriceCents: price.priceCents,
      listPriceCents,
      maxDownPaymentCents: maxDownPaymentCents(listPriceCents, table),
      termsMonths: Object.keys(table.end_of_term_buyout_percent_of_financed)
        .map(Number)
        .sort((a, b) => a - b),
      quote: result.quote,
      vatRatePercent: vat.ratePercent,
      monthlyRentWithVatCents: grossCents(result.quote.monthlyNetRentCents, vat.rateBasisPoints),
      totalWithVatAtCurrentRateCents:
        result.quote.downPaymentCents + grossCents(result.quote.netTotalCents, vat.rateBasisPoints),
    },
  };
}

/** The Quote row's column values for a live quote (used inside a withAudit transaction). */
export function quoteRowData(live: LiveQuote, customerId: string | null) {
  return {
    id: crypto.randomUUID(),
    asset_id: live.assetId,
    customer_id: customerId,
    quantity: live.quantity,
    quote_date: live.asOf,
    price_list_version: live.priceListVersion,
    unit_list_price_cents: live.unitListPriceCents,
    list_price_cents: live.listPriceCents,
    down_payment_cents: live.quote.downPaymentCents,
    term_months: live.quote.termMonths,
    financed_cents: live.quote.financedCents,
    band: live.quote.band,
    factor_ppm: live.quote.factorPpm,
    monthly_net_rent_cents: live.quote.monthlyNetRentCents,
    net_total_cents: live.quote.netTotalCents,
    last_month_net_rent_cents: live.quote.lastMonthNetRentCents,
    buyout_net_cents: live.quote.buyoutNetCents,
  };
}
