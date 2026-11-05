// POST /api/applications/questions
// body: { asset_id, quantity?, term_months, down_payment_cents?, answers? }
// Which questions apply to this customer and deal, given the answers so far. Send it again
// after every answer: the list can grow or shrink. Saves nothing.
import { requireCustomer } from '@/server/actor';
import { applicationRequestSchema, failureResponse } from '@/server/application-request';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { describeQuestions } from '@/server/applications';
import { db } from '@/server/db';

export const POST = handleRoute(async (request) => {
  const customer = await requireCustomer('application.submit');
  const body = await readJsonBody(request, applicationRequestSchema);

  const result = await describeQuestions(db, {
    customer,
    assetId: body.asset_id,
    quantity: body.quantity,
    termMonths: body.term_months,
    downPaymentCents: body.down_payment_cents,
    answers: body.answers,
  });
  if (!result.ok) return failureResponse(result, body.asset_id);

  const { questions, ...rest } = result;
  return ok({
    ...rest,
    questions: questions.map(({ id, type, text, why_we_ask, options, validation }) => ({
      id,
      type,
      text,
      why_we_ask,
      ...(options ? { options } : {}),
      ...(validation ? { hint: validation.hint } : {}),
    })),
  });
});
