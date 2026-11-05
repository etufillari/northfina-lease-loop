import { isoDateSchema, centsSchema } from '@/data/schemas';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { quoteFor, type QuoteInput, type QuoteResult } from '@/domain/quote';
import { toAsset } from './assets';
import type { PrismaClient } from './prisma-client';
import { z } from 'zod';

export const quoteRequestSchema = z.strictObject({
  assetId: z.string().min(1),
  date: isoDateSchema,
  downPaymentCents: centsSchema,
  termMonths: z.number().int().positive(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type CreateQuoteResult = QuoteResult | { ok: false; reason: 'asset_not_found' };

/** Reads the current asset state and combines it with the immutable pricing data pack. */
export async function createQuote(db: PrismaClient, input: QuoteInput): Promise<CreateQuoteResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'asset_not_found' };

  const [priceLists, coefficientTable, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);

  return quoteFor(toAsset(row), priceLists, coefficientTable, vatRates, input);
}
