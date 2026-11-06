// POST /api/waitlist/:id/decline  body: { actor }  [?asOf=]
// Declines an offer: the entry leaves the list and the items pass to the next person.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { declineOffer } from '@/server/waitlist-actions';
import { actorBody, waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/decline'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, actorBody);
    const result = await declineOffer(db, {
      entryId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ passedOn: result.passedOn });
  }
);
