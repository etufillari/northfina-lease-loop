// Live pricing for the sliders, and the persisted Quote row an application starts from.
// Assets are unique physical items, so a fleet is a group of DISTINCT assets (same
// category) priced as ONE banded total — never "4 copies" of the same item.
// All numbers come from the pure domain functions; this file only loads data and stores.
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { maxDownPaymentCents, quoteFor, type Quote } from '@/domain/pricing';
import { listPriceOn } from '@/domain/price-list';
import { grossCents, vatRateOn } from '@/domain/vat';

export type LiveQuote = {
  assetIds: string[];
  asOf: string;
  priceListVersion: number;
  /** Asset id → its net list price on the quote date. */
  unitListPricesCents: Record<string, number>;
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
        | 'no_assets'
        | 'duplicate_assets'
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
  assetIds: string[];
  downPaymentCents: number;
  termMonths: number;
  asOf: string;
}): Promise<LiveQuoteResult> {
  if (input.assetIds.length === 0) return { ok: false, reason: 'no_assets' };
  // Each physical item can be in the group once: there is no second ebike-004.
  if (new Set(input.assetIds).size !== input.assetIds.length) {
    return { ok: false, reason: 'duplicate_assets' };
  }

  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  const unitListPricesCents: Record<string, number> = {};
  let listPriceCents = 0;
  let priceListVersion = 0;
  for (const assetId of input.assetIds) {
    const price = listPriceOn(priceLists, assetId, input.asOf);
    if (!price.ok) return { ok: false, reason: price.reason };
    unitListPricesCents[assetId] = price.priceCents;
    listPriceCents += price.priceCents;
    priceListVersion = price.priceListVersion;
  }

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
      assetIds: input.assetIds,
      asOf: input.asOf,
      priceListVersion,
      unitListPricesCents,
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
    asset_id: live.assetIds[0]!,
    asset_ids_json: JSON.stringify(live.assetIds),
    customer_id: customerId,
    quantity: live.assetIds.length,
    quote_date: live.asOf,
    price_list_version: live.priceListVersion,
    unit_list_price_cents: live.unitListPricesCents[live.assetIds[0]!]!,
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

/** The asset ids a stored quote covers (older rows have only asset_id). */
export function quoteAssetIds(quote: {
  asset_id: string;
  asset_ids_json: string | null;
}): string[] {
  return quote.asset_ids_json ? (JSON.parse(quote.asset_ids_json) as string[]) : [quote.asset_id];
}
