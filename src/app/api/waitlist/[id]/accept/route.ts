// POST /api/waitlist/:id/accept  [?asOf=]
// The waiter accepts an offer: a normal application at the second-life price; returns its id.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { requireCustomer } from '@/server/current-user';
import { db } from '@/server/db';
import { acceptOffer } from '@/server/waitlist-actions';
import { waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/accept'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const result = await acceptOffer(db, {
      entryId: id,
      actor: user.actorId,
      asOf: await asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ applicationId: result.applicationId });
  }
);
