// Prices an asset on a date: loads what the pure `quote()` needs, then adds VAT for display.
// The VAT here is for that date only; a contract locks net rent, and each invoice works out
// its own VAT.
import type { Quote, QuoteFailureReason } from '@/data/lease-schemas';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { quote } from '@/domain/pricing';
import { vatCents, vatRateOn } from '@/domain/vat';
import type { PrismaClient } from '@/generated/prisma/client';

export type AssetQuote = Quote & {
  asset_id: string;
  quote_date: string;
  factor: number;
  vat_rate_percent: number;
  monthly_vat_cents: number;
  monthly_total_cents: number;
  buyout_percent: number | null;
  total_net_cost_cents: number;
};

export type QuoteAssetFailureReason =
  QuoteFailureReason | 'asset_not_found' | 'asset_not_available' | 'no_price_on_date';

export type QuoteAssetResult =
  { ok: true; quote: AssetQuote } | { ok: false; reason: QuoteAssetFailureReason };

export async function quoteAsset(
  db: PrismaClient,
  input: { assetId: string; date: string; termMonths: number; downPaymentCents: number }
): Promise<QuoteAssetResult> {
  const { assetId, date, termMonths, downPaymentCents } = input;

  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { status: true } });
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  if (asset.status !== 'available') return { ok: false, reason: 'asset_not_available' };

  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  const listPrice = listPriceOn(priceLists, assetId, date);
  const vatRate = vatRateOn(vatRates, date);
  if (!listPrice.ok || !vatRate.ok) return { ok: false, reason: 'no_price_on_date' };

  const result = quote(table, {
    basePriceCents: listPrice.priceCents,
    priceListVersion: listPrice.priceListVersion,
    downPaymentCents,
    termMonths,
  });
  if (!result.ok) return result;

  const priced = result.quote;
  const monthlyVatCents = vatCents(priced.monthly_net_rent_cents, vatRate.rateBasisPoints);

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
      buyout_percent: table.end_of_term_buyout_percent_of_financed[String(termMonths)] ?? null,
      total_net_cost_cents:
        priced.down_payment_cents +
        priced.monthly_net_rent_cents * priced.term_months +
        priced.buyout_cents,
    },
  };
}
