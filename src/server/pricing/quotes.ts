// Prices an asset on a date: loads what the pure `quote()` needs, then adds VAT for display.
// The VAT here is for that date only; a contract locks net rent, and each invoice works out
// its own VAT.
import type { Quote, QuoteFailureReason } from '@/data/lease-schemas';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { isHeldForSomeoneElse } from '@/domain/assets/status';
import { upcomingVatChange, type UpcomingVatChange } from '@/domain/invoicing/vat-change';
import { assetPriceOn } from '@/domain/pricing/price-list';
import { downPaymentLimits, quote } from '@/domain/pricing/pricing';
import { vatCents, vatRateOn } from '@/domain/vat';
import type { PrismaClient } from '@/generated/prisma/client';

/** The down payments that keep the deal valid. `null` when no down payment can. */
export type DownPaymentRange = { min_cents: number; max_cents: number } | null;

export type AssetQuote = Quote & {
  asset_id: string;
  quote_date: string;
  factor: number;
  vat_rate_percent: number;
  monthly_vat_cents: number;
  monthly_total_cents: number;
  /** Set when a VAT change falls within the lease, so the total above will not last. */
  upcoming_vat_change: UpcomingVatChange | null;
  buyout_percent: number | null;
  /** Down payment plus every rent: what a customer who returns the item pays. */
  total_if_returned_cents: number;
  /** The same plus the buyout: what a customer who keeps the item pays. */
  total_if_bought_cents: number;
  down_payment_limits: DownPaymentRange;
};

export type QuoteAssetFailureReason =
  QuoteFailureReason | 'asset_not_found' | 'asset_not_available' | 'no_price_on_date';

export type QuoteAssetResult =
  | { ok: true; quote: AssetQuote }
  // Set when the asset has a price but the deal could not be priced: the limits let a slider
  // recover, and the price is what a rejected application records.
  | {
      ok: false;
      reason: QuoteAssetFailureReason;
      down_payment_limits?: DownPaymentRange;
      base_price_cents?: number;
      price_list_version?: number | null;
    };

export async function quoteAsset(
  db: PrismaClient,
  input: {
    assetId: string;
    date: string;
    termMonths: number;
    downPaymentCents: number;
    /** Who is asking. An item held for someone else cannot be quoted. */
    customerId?: string;
  }
): Promise<QuoteAssetResult> {
  const { assetId, date, termMonths, downPaymentCents, customerId } = input;

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { status: true, relist_price_cents: true, reserved_for: true },
  });
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  if (asset.status !== 'available' || isHeldForSomeoneElse(asset.reserved_for, customerId)) {
    return { ok: false, reason: 'asset_not_available' };
  }

  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  const listPrice = assetPriceOn(
    priceLists,
    { id: assetId, relist_price_cents: asset.relist_price_cents ?? undefined },
    date
  );
  const vatRate = vatRateOn(vatRates, date);
  if (!listPrice.ok || !vatRate.ok) return { ok: false, reason: 'no_price_on_date' };

  const basePriceCents = listPrice.priceCents;
  const limits = downPaymentLimits(table, basePriceCents);
  const range: DownPaymentRange = limits.ok
    ? { min_cents: limits.minCents, max_cents: limits.maxCents }
    : null;

  const result = quote(table, {
    basePriceCents,
    priceListVersion: listPrice.priceListVersion,
    downPaymentCents,
    termMonths,
  });
  if (!result.ok) {
    return {
      ...result,
      down_payment_limits: range,
      base_price_cents: basePriceCents,
      price_list_version: listPrice.priceListVersion,
    };
  }

  const priced = result.quote;
  const monthlyVatCents = vatCents(priced.monthly_net_rent_cents, vatRate.rateBasisPoints);
  const totalIfReturned =
    priced.down_payment_cents + priced.monthly_net_rent_cents * priced.term_months;

  return {
    ok: true,
    quote: {
      ...priced,
      asset_id: assetId,
      quote_date: date,
      factor: priced.factor_micros / 1_000_000,
      vat_rate_percent: vatRate.rateBasisPoints / 100,
      monthly_vat_cents: monthlyVatCents,
      monthly_total_cents: priced.monthly_net_rent_cents + monthlyVatCents,
      upcoming_vat_change: upcomingVatChange(vatRates, {
        startOn: date,
        termMonths: priced.term_months,
        monthlyNetRentCents: priced.monthly_net_rent_cents,
      }),
      buyout_percent: table.end_of_term_buyout_percent_of_financed[String(termMonths)] ?? null,
      total_if_returned_cents: totalIfReturned,
      total_if_bought_cents: totalIfReturned + priced.buyout_cents,
      down_payment_limits: range,
    },
  };
}
