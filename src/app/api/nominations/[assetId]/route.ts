// POST /api/nominations/:assetId  body: { accept, actor }  [?asOf=]
// The nominee answers an invitation to take an item over when its lease ends. Only the
// invited customer can answer (the actor is the nominee).
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { answerNomination } from '@/server/nominations';

const bodySchema = z.strictObject({
  accept: z.boolean(),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/nominations/[assetId]'>) => {
    const { assetId } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await answerNomination(db, {
      assetId,
      customerId: body.actor,
      accept: body.accept,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'no_invitation')
        return fail(404, 'NO_INVITATION', 'There is no open invitation for you on this item');
      if (result.reason === 'expired')
        return fail(409, 'INVITATION_EXPIRED', 'This invitation has run out');
      return fail(409, 'NO_LONGER_AVAILABLE', 'This item is no longer available');
    }
    return ok({ heldNow: result.heldNow });
  }
);
