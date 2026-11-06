import { isoDateSchema, centsSchema, type Asset } from '@/data/schemas';
import {
  loadCoefficientTable,
  loadPriceLists,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import { quoteFor, type QuoteInput, type QuoteResult } from '@/domain/pricing/quote';
import { toAsset } from '../assets/assets';
import type { PrismaClient } from '../prisma-client';
import { z } from 'zod';

export const quoteRequestSchema = z.strictObject({
  assetId: z.string().min(1),
  date: isoDateSchema,
  downPaymentCents: centsSchema,
  termMonths: z.number().int().positive(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type CreateQuoteFailure =
  Extract<QuoteResult, { ok: false }> | { ok: false; reason: 'asset_not_found' };
export type CreateQuoteResult = Extract<QuoteResult, { ok: true }> | CreateQuoteFailure;
export type CreateQuoteWithAssetResult =
  (Extract<QuoteResult, { ok: true }> & { asset: Asset }) | CreateQuoteFailure;

/** Reads the current asset state and combines it with the immutable pricing data pack. */
export async function createQuoteWithAsset(
  db: PrismaClient,
  input: QuoteInput
): Promise<CreateQuoteWithAssetResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'asset_not_found' };

  const asset = toAsset(row);

  const [priceLists, residualCurves, coefficientTable, vatRates] = await Promise.all([
    loadPriceLists(),
    loadResidualCurves(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  const result = quoteFor(asset, priceLists, residualCurves, coefficientTable, vatRates, input);
  if (!result.ok) return result;
  return { ...result, asset };
}

export async function createQuote(db: PrismaClient, input: QuoteInput): Promise<CreateQuoteResult> {
  const result = await createQuoteWithAsset(db, input);
  if (!result.ok) return result;
  return { ok: true, quote: result.quote };
}
