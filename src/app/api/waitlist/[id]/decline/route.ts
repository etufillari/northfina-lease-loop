// POST /api/waitlist/:id/decline  [?asOf=]
// Declines an offer (the waiter, or staff for them): the items pass to the next person.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { declineOffer } from '@/server/waitlist-actions';
import { waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/decline'>) => {
    const { id } = await params;
    const user = await requireUser();
    if (user instanceof Response) return user;
    const result = await declineOffer(db, {
      entryId: id,
      actor: user.actorId,
      isStaff: user.isStaff,
      asOf: asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ passedOn: result.passedOn });
  }
);
