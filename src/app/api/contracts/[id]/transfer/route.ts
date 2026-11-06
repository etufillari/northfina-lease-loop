// POST /api/contracts/:id/transfer  body: { actor } — create (or re-use) the shareable
// take-over link for an active contract.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { createTransferLink } from '@/server/transfers';

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/transfer'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await createTransferLink(db, {
      contractId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_found') return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
      if (result.reason === 'term_over')
        return fail(409, 'TERM_OVER', 'The term is over: buy, return or nominate a successor');
      return fail(409, 'NOT_ACTIVE', 'Only an active contract can be passed on');
    }
    return ok({ token: result.token });
  }
);
