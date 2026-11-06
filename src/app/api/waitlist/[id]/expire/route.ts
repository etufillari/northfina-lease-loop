// POST /api/waitlist/:id/expire  [?asOf=]
// Staff: ends an offer whose 3-day hold has run out and passes the items on.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { requireStaff } from '@/server/current-user';
import { db } from '@/server/db';
import { expireOffer } from '@/server/waitlist-actions';
import { waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/expire'>) => {
    const { id } = await params;
    const user = await requireStaff();
    if (user instanceof Response) return user;
    const result = await expireOffer(db, {
      entryId: id,
      actor: user.actorId,
      asOf: await asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ passedOn: result.passedOn });
  }
);
