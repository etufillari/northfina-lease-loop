// POST /api/waitlist/:id/expire  body: { actor }  [?asOf=]
// Staff: ends an offer whose 7-day hold has run out and passes the items on.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { expireOffer } from '@/server/waitlist-actions';
import { actorBody, waitlistFailure } from '../../failure';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/waitlist/[id]/expire'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, actorBody);
    const result = await expireOffer(db, {
      entryId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) return waitlistFailure(result.reason);
    return ok({ passedOn: result.passedOn });
  }
);
