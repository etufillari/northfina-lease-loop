// POST /api/demo/reset — back to the data pack's start state (see
// src/server/demo-reset.ts). The demo bar then moves its date to the start date.
import { fail, handleRoute, ok } from '@/server/api-response';
import { currentUser } from '@/server/current-user';
import { demoMode } from '@/server/demo-mode';
import { db } from '@/server/db';
import { resetDemo } from '@/server/demo-reset';

export const POST = handleRoute(async () => {
  if (!demoMode()) return fail(404, 'NOT_FOUND', 'No such route');
  const reset = await resetDemo(db, { actor: (await currentUser())?.actorId ?? 'demo' });
  const customerIds = (await db.customer.findMany({ select: { id: true } })).map((c) => c.id);
  return ok({ ...reset, customerIds });
});
