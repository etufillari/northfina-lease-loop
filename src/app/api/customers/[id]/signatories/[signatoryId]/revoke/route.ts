// POST /api/customers/:id/signatories/:signatoryId/revoke
// D46: ends the signatory's right on the request's day; the last active one cannot be revoked.
// Authorized first (D73, D74): the admin, or the company's account as an active signatory.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { revokeSignatory } from '@/server/signatories';
import { signatoryFailure } from '@/server/signatory-responses';
import { signatoryParamsSchema } from '@/server/signatory-schemas';

export const POST = handleRoute(
  async (
    _request,
    { params }: RouteContext<'/api/customers/[id]/signatories/[signatoryId]/revoke'>
  ) => {
    const { id, signatoryId } = signatoryParamsSchema.parse(await params);
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'manage_signatories', { customer: id });
    if (!auth.ok) {
      return refusalResponse(auth.reason, () =>
        fail(404, 'SIGNATORY_NOT_FOUND', 'No such company or signatory')
      );
    }

    const today = await todayForRequest();
    const result = await revokeSignatory(db, { customerId: id, signatoryId, actor, today });
    return result.ok ? ok(result.signatory) : signatoryFailure(result);
  }
);
