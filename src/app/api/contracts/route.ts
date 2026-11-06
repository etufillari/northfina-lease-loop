// POST /api/contracts   body: { "application_id": "app-..." }
//   A client signs their approved application. The price comes from the application and the
//   dates from the server, so neither is in the request.
// GET /api/contracts
//   A client gets their own contracts. Staff get everyone's.
import { z } from 'zod';
import { can } from '@/domain/identity';
import { ApiError, fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { requireActor, requireCustomer } from '@/server/auth/actor';
import { contractViews, listContracts, signContract } from '@/server/contract/contracts';
import { db } from '@/server/db';

const bodySchema = z.strictObject({ application_id: z.string().trim().min(1) });

export const POST = handleRoute(async (request) => {
  const customer = await requireCustomer('contract.sign');
  const body = await readJsonBody(request, bodySchema);

  const result = await signContract(db, { applicationId: body.application_id, customer });
  if (result.ok) return ok(result.contract, { status: 201 });

  switch (result.reason) {
    case 'application_not_found':
      return fail(404, 'APPLICATION_NOT_FOUND', `No application with id "${body.application_id}"`);
    case 'not_approved':
      return fail(409, 'APPLICATION_NOT_APPROVED', 'This application is not approved');
    case 'already_signed':
      return fail(409, 'ALREADY_SIGNED', 'This application has already been signed');
    case 'asset_not_available':
      return fail(409, 'ASSET_NOT_AVAILABLE', 'This item cannot be leased right now');
    case 'signatory_required':
      return fail(403, 'SIGNATORY_REQUIRED', 'Someone else must sign for this company', {
        signatory_email: result.signatory_email,
      });
  }
});

export const GET = handleRoute(async () => {
  const actor = await requireActor();
  const customerId = actor.kind === 'customer' ? actor.customer.id : undefined;
  if (customerId === undefined && !can(actor.role, 'contract.view_all')) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this.');
  }
  return ok(await contractViews(await listContracts(db, { customerId })));
});
