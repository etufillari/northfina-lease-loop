// What a customer can choose for one item today, and the quote for the default choice.
import { loadCoefficientTable, loadPriceLists, loadResidualCurves } from '@/data/load';
import { itemPriceOn } from '@/domain/pricing/item-price';
import { leaseLimitsFor, type LeaseLimits } from '@/domain/pricing/lease-limits';
import type { QuoteData } from '@/domain/pricing/quote';
import { toAsset } from '../assets/assets';
import { createQuote, type CreateQuoteFailure } from './quotes';
import type { PrismaClient } from '../prisma-client';

export type LeaseOfferResult =
  { ok: true; limits: LeaseLimits; quote: QuoteData } | CreateQuoteFailure;

/** Reads the limits for the asset on `date`, then prices the choice the sliders start on. */
export async function createLeaseOffer(
  db: PrismaClient,
  assetId: string,
  date: string
): Promise<LeaseOfferResult> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return { ok: false, reason: 'unknown_asset' };

  const [priceLists, residualCurves, coefficientTable] = await Promise.all([
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
  ]);

  const itemPrice = itemPriceOn(toAsset(row), priceLists, residualCurves, date);
  if (!itemPrice.ok) return itemPrice;

  const limits = leaseLimitsFor(coefficientTable, itemPrice.priceCents);
  if (!limits.ok) return limits;

  const { ok: _ok, ...choices } = limits;
  const result = await createQuote(db, {
    assetId,
    date,
    downPaymentCents: choices.minDownPaymentCents,
    termMonths: choices.defaultTermMonths,
  });
  if (!result.ok) return result;

  return { ok: true, limits: choices, quote: result.quote };
}
