// POST /api/waitlist/:id/accept  body: { actor }  [?asOf=]
// Accepts an offer: starts a normal application at the second-life price and returns its id.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { acceptOffer } from '@/server/waitlist-actions';
import { actorBody, waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/accept'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, actorBody);
    const result = await acceptOffer(db, {
      entryId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ applicationId: result.applicationId });
  }
);
