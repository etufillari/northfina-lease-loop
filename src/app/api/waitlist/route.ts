// POST /api/waitlist  body: { customerId, category, maxMonthlyNetRentCents, minCondition,
//                             preferredTermMonths, neededBy, quantity, actor }  [?asOf=]
// Joins the second-life waiting list today (the as-of date): first come, first served.
import { z } from 'zod';
import { assetCategorySchema, assetConditionSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { joinWaitlist } from '@/server/waitlist-actions';
import { waitlistFailure } from './failure';

const bodySchema = z
  .strictObject({
    customerId: z.string().trim().min(1),
    category: assetCategorySchema,
    maxMonthlyNetRentCents: z.number().int().positive().max(10_000_000),
    minMonthlyNetRentCents: z.number().int().min(0).max(10_000_000).default(0),
    minCondition: assetConditionSchema,
    preferredTermMonths: z.number().int().positive(),
    neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.number().int().min(1).max(10),
    actor: z.string().trim().min(1).max(100),
  })
  .refine((body) => body.minMonthlyNetRentCents <= body.maxMonthlyNetRentCents, {
    message: 'The minimum budget cannot be above the maximum',
  });

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const result = await joinWaitlist(db, { ...body, asOf: asOfFrom(request) });
  if (!result.ok) return waitlistFailure(result.reason);
  return ok({ id: result.entry.id }, { status: 201 });
});
