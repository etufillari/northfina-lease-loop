// POST /api/demo/reset  body: { actor } — back to the data pack's start state (see
// src/server/demo-reset.ts). The demo bar then moves its date to the start date.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { resetDemo } from '@/server/demo-reset';

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  if (!body) return fail(400, 'INVALID_JSON', 'Bad body');
  const reset = await resetDemo(db, body);
  const customerIds = (await db.customer.findMany({ select: { id: true } })).map((c) => c.id);
  return ok({ ...reset, customerIds });
});
