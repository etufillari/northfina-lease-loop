// POST /api/demo/advance  body: { from, to } — the demo clock moves forward from `from`
// to `to`: the overnight job runs for every day in between on which a hold lapses (see
// src/server/hold-expiry.ts). The demo bar then sets its date to `to`.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { currentUser } from '@/server/current-user';
import { demoMode } from '@/server/demo-mode';
import { db } from '@/server/db';
import { expireLapsedHolds } from '@/server/hold-expiry';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.strictObject({
  from: isoDate,
  to: isoDate,
});

export const POST = handleRoute(async (request) => {
  if (!demoMode()) return fail(404, 'NOT_FOUND', 'No such route');
  const body = await readJsonBody(request, bodySchema);
  if (!body) return fail(400, 'INVALID_JSON', 'Bad body');
  if (body.to <= body.from) return fail(422, 'NOT_FORWARD', 'Time only moves forward');
  // The overnight job acts on its own: the audit log names `system`, with who moved the clock.
  const summary = await expireLapsedHolds(db, { from: body.from, to: body.to });
  const movedBy = (await currentUser())?.actorId ?? 'demo';
  return ok({ to: body.to, movedBy, ...summary });
});
