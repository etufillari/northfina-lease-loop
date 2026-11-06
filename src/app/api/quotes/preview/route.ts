// GET /api/quotes/preview?assetId=ebike-003&termMonths=36&downPaymentCents=0[&onDate=2026-11-05]
// Prices an asset without saving anything, for the sliders. `onDate` defaults to today.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { loadPricingData } from '@/server/pricing-data';
import { previewQuote } from '@/server/quotes';
import { todayIso } from '@/server/today';

const querySchema = z.object({
  assetId: z.string().min(1),
  termMonths: z.coerce.number().int().positive(),
  downPaymentCents: z.coerce.number().int().nonnegative().default(0),
  onDate: isoDateSchema.optional(),
});

export const GET = handleRoute(async (request) => {
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(searchParams));
  return ok(
    await previewQuote(db, await loadPricingData(), {
      ...query,
      onDate: query.onDate ?? todayIso(),
    })
  );
});
