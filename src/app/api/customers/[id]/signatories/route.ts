// GET  /api/customers/:id/signatories   the company's signatory list with each entry's state today
// POST /api/customers/:id/signatories   body: { name, email, validFrom, validTo }
// D46, D73: the list is read by the company's own account and by the admin; it is changed by
// the admin and by the company's account only when that account is itself an active
// signatory (`addSignatory` checks the mandate). Authorized first (D74). The day is the
// request's (demo clock).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { addSignatory, listSignatories } from '@/server/signatories';
import { signatoryFailure } from '@/server/signatory-responses';
import { addSignatoryBodySchema, customerIdParamsSchema } from '@/server/signatory-schemas';

const notFound = () => fail(404, 'SIGNATORY_NOT_FOUND', 'No such company or signatory');

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/customers/[id]/signatories'>) => {
    const { id } = customerIdParamsSchema.parse(await params);
    const auth = await authorize(db, await readActor(db), 'read_signatories', { customer: id });
    if (!auth.ok) return refusalResponse(auth.reason, notFound);
    return ok(await listSignatories(db, id, await todayForRequest()));
  }
);

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/customers/[id]/signatories'>) => {
    const { id } = customerIdParamsSchema.parse(await params);
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'manage_signatories', { customer: id });
    if (!auth.ok) return refusalResponse(auth.reason, notFound);
    const body = await readJsonBody(request, addSignatoryBodySchema);

    const result = await addSignatory(db, {
      ...body,
      customerId: id,
      actor,
      today: await todayForRequest(),
    });
    return result.ok ? ok(result.signatory, { status: 201 }) : signatoryFailure(result);
  }
);
