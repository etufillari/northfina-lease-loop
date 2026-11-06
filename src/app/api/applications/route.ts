// POST /api/applications: re-evaluates and stores a completed application.
import { z } from 'zod';
import { assetCategorySchema, isoDateSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { submitApplication } from '@/server/applications';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  answers: z.record(z.string(), z.unknown()),
  category: assetCategorySchema,
  financedAmountCents: z.number().int().positive(),
  contractStartDate: isoDateSchema,
  monthlyRentWithVatCents: z.number().int().nonnegative().optional(),
  quoteId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  return ok(await submitApplication(db, body), { status: 201 });
});
