// POST /api/staff/holds/release  body:
// Releases every approval hold that ran out as of the as-of date: the applications become
// expired and their items available again. One audit row per released application.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { releaseExpiredHolds } from '@/server/staff-holds';
import { requireStaff } from '@/server/current-user';

export const POST = handleRoute(async (request) => {
  const user = await requireStaff();
  if (user instanceof Response) return user;
  const released = await releaseExpiredHolds(db, {
    actor: user.actorId,
    asOf: await asOfFrom(request),
  });
  return ok({ released });
});
