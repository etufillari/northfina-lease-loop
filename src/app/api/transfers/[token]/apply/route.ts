// POST /api/transfers/:token/apply  body: { customerId }
// The recipient starts the take-over application: the normal question flow, judged against
// the contract's locked rent (no down payment).
import { fail, handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { notYours } from '@/server/authz';
import { db } from '@/server/db';
import { startTransferApplication } from '@/server/transfers';
import { requireCustomer } from '@/server/current-user';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/transfers/[token]/apply'>) => {
    const { token } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const result = await startTransferApplication(db, {
      token,
      customerId: user.customerId,
      actor: user.actorId,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      if (result.reason === 'own_contract') {
        return fail(409, 'OWN_CONTRACT', 'This is already your lease');
      }
      if (result.reason === 'term_over') {
        return fail(
          409,
          'TERM_OVER',
          'This lease has reached its end; there is nothing left to take over'
        );
      }
      return fail(404, 'TRANSFER_NOT_FOUND', 'This transfer link is no longer valid');
    }
    return ok({ applicationId: result.applicationId }, { status: 201 });
  }
);
