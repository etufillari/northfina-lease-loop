// POST /api/waitlist/:id/leave  [?asOf=]
// The signed-in customer leaves the queue (staff may do it for a waiter).
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { leaveWaitlist } from '@/server/waitlist-actions';
import { waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/leave'>) => {
    const { id } = await params;
    const user = await requireUser();
    if (user instanceof Response) return user;
    const result = await leaveWaitlist(db, {
      entryId: id,
      actor: user.actorId,
      isStaff: user.isStaff,
      asOf: await asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ done: true });
  }
);
