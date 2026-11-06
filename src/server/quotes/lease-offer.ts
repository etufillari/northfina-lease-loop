// What a customer can choose for one item today, and the quote for the default choice.
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import { leaseLimitsFor, type LeaseLimits } from '@/domain/pricing/lease-limits';
import { listPriceOn } from '@/domain/pricing/price-list';
import type { QuoteData } from '@/domain/pricing/quote';
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
  const [priceLists, coefficientTable] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
  ]);

  const listPrice = listPriceOn(priceLists, assetId, date);
  if (!listPrice.ok) return listPrice;

  const limits = leaseLimitsFor(coefficientTable, listPrice.priceCents);
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
