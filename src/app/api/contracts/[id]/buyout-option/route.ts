// POST /api/contracts/:id/buyout-option  body: { optIn, actor }
// The mid-lease "I want to buy it at the end" flag. Never counted against affordability.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { setBuyoutOption } from '@/server/lifecycle';

const bodySchema = z.strictObject({
  optIn: z.boolean(),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/buyout-option'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await setBuyoutOption(db, {
      contractId: id,
      optIn: body.optIn,
      actor: body.actor,
    });
    if (!result.ok) {
      if (result.reason === 'not_found') return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
      return fail(409, 'NOT_ACTIVE', 'This contract has already ended');
    }
    return ok({ done: true });
  }
);
