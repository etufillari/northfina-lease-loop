// POST /api/contracts/:id/transfer  body:  — create (or re-use) the shareable
// take-over link for an active contract.
import { fail, handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { notYours } from '@/server/authz';
import { db } from '@/server/db';
import { createTransferLink } from '@/server/transfers';
import { requireCustomer } from '@/server/current-user';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/transfer'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const result = await createTransferLink(db, {
      contractId: id,
      actor: user.actorId,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      if (result.reason === 'not_found') return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
      if (result.reason === 'term_over')
        return fail(409, 'TERM_OVER', 'The term is over: buy, return or nominate a successor');
      return fail(409, 'NOT_ACTIVE', 'Only an active contract can be passed on');
    }
    return ok({ token: result.token });
  }
);
