// POST /api/applications   body: { asset_id, quantity?, term_months, down_payment_cents?, answers }
//   A client applies. The server prices the deal on its own date and decides:
//   approved, rejected (with reasons) or manual_review.
// GET /api/applications[?decision=manual_review]
//   A client gets their own applications, and an admin everyone's: the review queue.
//   A signatory gets the ones waiting for their signature.
import { z } from 'zod';
import { applicationDecisionSchema } from '@/data/lease-schemas';
import { actingCustomerId, can } from '@/domain/identity';
import { requireActor, requireCustomer } from '@/server/auth/actor';
import {
  applicationRequestSchema,
  failureResponse,
} from '@/server/application/application-request';
import { ApiError, handleRoute, ok, readJsonBody } from '@/server/api-response';
import {
  listApplications,
  submitApplication,
  applicationViews,
  type ApplicationView,
} from '@/server/application/applications';
import { db } from '@/server/db';

const querySchema = z.strictObject({ decision: applicationDecisionSchema.optional() });

const isWaitingForSignature = (view: ApplicationView) =>
  view.decision === 'approved' && view.contract_id === null;

export const POST = handleRoute(async (request) => {
  const customer = await requireCustomer('application.submit');
  const body = await readJsonBody(request, applicationRequestSchema);

  const result = await submitApplication(db, {
    customer,
    assetId: body.asset_id,
    quantity: body.quantity,
    termMonths: body.term_months,
    downPaymentCents: body.down_payment_cents,
    answers: body.answers,
  });
  if (!result.ok) return failureResponse(result, body.asset_id);
  return ok(result.application, { status: 201 });
});

export const GET = handleRoute(async (request) => {
  const actor = await requireActor();
  const customerId = actingCustomerId(actor);
  if (customerId === undefined && !can(actor.role, 'application.decide_manual_review')) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this.');
  }

  const searchParams = new URL(request.url).searchParams;
  const { decision } = querySchema.parse(Object.fromEntries(searchParams));
  const views = await applicationViews(db, await listApplications(db, { decision, customerId }));
  return ok(actor.kind === 'signatory' ? views.filter(isWaitingForSignature) : views);
});
