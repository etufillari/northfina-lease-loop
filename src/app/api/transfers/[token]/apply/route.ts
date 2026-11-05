// POST /api/transfers/:token/apply  body: { customerId, actor }
// The recipient starts the take-over application: the normal question flow, judged against
// the contract's locked rent (no down payment).
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { startTransferApplication } from '@/server/transfers';

const bodySchema = z.strictObject({
  customerId: z.string().min(1),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/transfers/[token]/apply'>) => {
    const { token } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await startTransferApplication(db, {
      token,
      customerId: body.customerId,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'own_contract') {
        return fail(409, 'OWN_CONTRACT', 'This is already your lease');
      }
      return fail(404, 'TRANSFER_NOT_FOUND', 'This transfer link is no longer valid');
    }
    return ok({ applicationId: result.applicationId }, { status: 201 });
  }
);
