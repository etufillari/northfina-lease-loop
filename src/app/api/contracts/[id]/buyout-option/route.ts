// POST /api/contracts/:id/buyout-option  body: { optIn }
// The mid-lease "I want to buy it at the end" flag. Never counted against affordability.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { notYours } from '@/server/authz';
import { db } from '@/server/db';
import { setBuyoutOption } from '@/server/lifecycle';
import { requireCustomer } from '@/server/current-user';

const bodySchema = z.strictObject({
  optIn: z.boolean(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/buyout-option'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await setBuyoutOption(db, {
      contractId: id,
      optIn: body.optIn,
      actor: user.actorId,
    });
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      if (result.reason === 'not_found') return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
      if (result.reason === 'nominated')
        return fail(409, 'NOMINATED', 'A successor is nominated for this item');
      return fail(409, 'NOT_ACTIVE', 'This contract has already ended');
    }
    return ok({ done: true });
  }
);
