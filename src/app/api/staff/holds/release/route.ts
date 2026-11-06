// POST /api/staff/holds/release  body: { actor }
// Releases every approval hold that ran out as of the as-of date: the applications become
// expired and their items available again. One audit row per released application.
import { z } from 'zod';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { staffOnly } from '@/server/authz';
import { db } from '@/server/db';
import { releaseExpiredHolds } from '@/server/staff-holds';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const denied = await staffOnly(db, body.actor);
  if (denied) return denied;
  const released = await releaseExpiredHolds(db, { actor: body.actor, asOf: asOfFrom(request) });
  return ok({ released });
});
