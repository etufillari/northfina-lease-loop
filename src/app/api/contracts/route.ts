// POST /api/contracts   body: { "applicationId": "…", "startDate": "2026-11-05" }
// Signs an approved application on the request's day (the demo clock, never a date from the
// body). `startDate` is the business start, checked against that day (D7). Authorized first
// (D73, D74): the applicant or admin, never a case waiting for the company's signatory. The
// contract copies the quote and never re-prices (card 2).
import { isAuthzRefusal } from '@/domain/authz/policy';
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { signContractBodySchema } from '@/server/contract-schemas';
import { signContract, type SignContractRefusal } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

const STATUS_OF: Partial<Record<SignContractRefusal['code'], number>> = {
  application_not_found: 404,
  already_signed: 409,
  quote_reserved_for_another_customer: 403,
  asset_not_available: 409,
  not_enough_units: 409,
};

const refused = (status: number, reason: SignContractRefusal) =>
  fail(status, 'SIGNING_REFUSED', 'The contract cannot be signed', reason);

export const POST = handleRoute(async (request) => {
  const actor = await readActor(db);
  const body = await readJsonBody(request, signContractBodySchema);
  const { applicationId } = body;
  const auth = await authorize(db, actor, 'sign_contract', { application: applicationId });
  if (!auth.ok) {
    return refusalResponse(auth.reason, () =>
      refused(404, { code: 'application_not_found', params: { applicationId } })
    );
  }

  const result = await signContract(db, { ...body, actor }, await todayForRequest());
  if (!result.ok) {
    if (isAuthzRefusal(result.reason)) return forbiddenResponse(result.reason);
    return refused(STATUS_OF[result.reason.code] ?? 422, result.reason);
  }
  return ok(result.details, { status: 201 });
});
