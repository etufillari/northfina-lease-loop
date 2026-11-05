// POST /api/applications   body: { asset_id, quantity?, term_months, down_payment_cents?, answers }
//   A client applies. The server prices the deal on its own date and decides:
//   approved, rejected (with reasons) or manual_review.
// GET /api/applications[?decision=manual_review]   the review queue, for an admin.
import { z } from 'zod';
import { applicationDecisionSchema } from '@/data/lease-schemas';
import { requireCustomer, requireRole } from '@/server/actor';
import { applicationRequestSchema, failureResponse } from '@/server/application-request';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listApplications, submitApplication, viewsOf } from '@/server/applications';
import { db } from '@/server/db';

const querySchema = z.strictObject({ decision: applicationDecisionSchema.optional() });

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
  await requireRole('application.decide_manual_review');
  const searchParams = new URL(request.url).searchParams;
  const { decision } = querySchema.parse(Object.fromEntries(searchParams));
  return ok(await viewsOf(await listApplications(db, { decision })));
});
