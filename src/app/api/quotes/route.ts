// POST /api/quotes   body: { assetId, termMonths, downPaymentCents, actor, customerId?, quotedOn? }
// Saves a quote as shown. `quotedOn` defaults to today; setting it replays the scenario cards.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { loadPricingData } from '@/server/pricing-data';
import { createQuote } from '@/server/quotes';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
  assetId: z.string().min(1),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative().default(0),
  actor: z.string().trim().min(1).max(100),
  customerId: z.string().min(1).optional(),
  quotedOn: isoDateSchema.optional(),
});

export const POST = handleRoute(async (request) => {
  const { quotedOn, ...body } = await readJsonBody(request, bodySchema);
  const quote = await createQuote(db, await loadPricingData(), {
    ...body,
    onDate: quotedOn ?? todayIso(),
  });
  return ok(quote, { status: 201 });
});
