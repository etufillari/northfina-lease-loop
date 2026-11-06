// POST /api/waitlist/:id/leave  body: { actor }  [?asOf=]
// Leaves the queue; anything held in a pool for the entry is passed on.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { leaveWaitlist } from '@/server/waitlist-actions';
import { actorBody, waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/leave'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, actorBody);
    const result = await leaveWaitlist(db, {
      entryId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ done: true });
  }
);
