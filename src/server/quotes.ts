// Live pricing for the sliders, and the persisted Quote row an application starts from.
// Assets are unique physical items, so a fleet is a group of DISTINCT assets (same
// category) priced as ONE banded total — never "4 copies" of the same item.
// All numbers come from the pure domain functions; this file only loads data and stores.
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { maxDownPaymentCents, quoteFor, requiredDownPayment, type Quote } from '@/domain/pricing';
import { listPriceOn } from '@/domain/price-list';
import { grossCents, vatRateOn } from '@/domain/vat';
import type { PrismaClient } from '@/generated/prisma/client';

/**
 * The second-life desk's re-price per asset id: refurbished value + refurbishment, quoted
 * instead of the catalogue list price once an item has been through the desk.
 */
export async function secondLifePrices(
  db: PrismaClient,
  assetIds?: string[]
): Promise<Record<string, number>> {
  const rows = await db.asset.findMany({
    where: {
      second_life_price_cents: { not: null },
      ...(assetIds ? { id: { in: assetIds } } : {}),
    },
    select: { id: true, second_life_price_cents: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.second_life_price_cents!]));
}

export type LiveQuote = {
  assetIds: string[];
  asOf: string;
  priceListVersion: number;
  /** Asset id → its net list price on the quote date (its second-life price, if it has one). */
  unitListPricesCents: Record<string, number>;
  /** The items priced at their second-life price instead of the price list. */
  secondLifeAssetIds: string[];
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
      /** Set when the price itself is known and only the configuration is refused. */
      listPriceCents?: number;
      maxDownPaymentCents?: number;
      /** Above the largest band: the smallest down payment that makes it leasable. */
      minDownPayment?: { cents: number; percent: number } | null;
    };

export async function buildLiveQuote(input: {
  assetIds: string[];
  downPaymentCents: number;
  termMonths: number;
  asOf: string;
  /** From `secondLifePrices`: these items are priced at the desk's re-price. */
  secondLifePricesCents?: Readonly<Record<string, number>>;
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
  const secondLifeAssetIds: string[] = [];
  let listPriceCents = 0;
  let priceListVersion = 0;
  for (const assetId of input.assetIds) {
    const price = listPriceOn(priceLists, assetId, input.asOf);
    if (!price.ok) return { ok: false, reason: price.reason };
    const secondLife = input.secondLifePricesCents?.[assetId];
    if (secondLife !== undefined) secondLifeAssetIds.push(assetId);
    const unit = secondLife ?? price.priceCents;
    unitListPricesCents[assetId] = unit;
    listPriceCents += unit;
    priceListVersion = price.priceListVersion;
  }

  const result = quoteFor({
    listPriceCents,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
    table,
  });
  if (!result.ok) {
    // The sliders stay usable on a refusal: the caller still gets the list price, the
    // down-payment cap, and — above the largest band — the smallest down payment that works.
    const required = requiredDownPayment(listPriceCents, table);
    return {
      ok: false,
      reason: result.reason,
      listPriceCents,
      maxDownPaymentCents: maxDownPaymentCents(listPriceCents, table),
      minDownPayment:
        required.needed && required.possible
          ? { cents: required.minDownPaymentCents, percent: required.minPercent }
          : null,
    };
  }

  const vat = vatRateOn(vatRates, input.asOf);
  if (!vat.ok) return { ok: false, reason: vat.reason };

  return {
    ok: true,
    live: {
      assetIds: input.assetIds,
      asOf: input.asOf,
      priceListVersion,
      unitListPricesCents,
      secondLifeAssetIds,
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
