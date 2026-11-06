// POST /api/applications   body: { quoteId, customerId, answers, onBehalfOf? }
// Authorized first (D73, D74): the customer must be the actor (the "continue as" cookie, D17,
// D40), anonymous is 401 and another customer 403. The admin applies for a customer only with
// onBehalfOf naming them (D47).
// Prunes the answers to the questions that apply, checks them, evaluates the eligibility rules
// (D9) and stores the application with its decision. The day is the request's (demo clock).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { createApplication } from '@/server/applications';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { createApplicationBodySchema } from '@/server/routes';

const customerNotFound = () => fail(404, 'CUSTOMER_NOT_FOUND', 'No customer with that id');

export const POST = handleRoute(async (request) => {
  const actor = await readActor(db);
  const body = await readJsonBody(request, createApplicationBodySchema);
  const auth = await authorize(db, actor, 'apply', { customer: body.customerId });
  if (!auth.ok) return refusalResponse(auth.reason, customerNotFound);
  const today = await todayForRequest();

  const result = await createApplication(db, { ...body, today, actor });
  if (result.ok) return ok(result.application, { status: 201 });

  switch (result.reason) {
    case 'quote_not_found':
      return fail(404, 'QUOTE_NOT_FOUND', 'No quote with that id');
    case 'customer_not_found':
      return customerNotFound();
    case 'forbidden':
      return forbiddenResponse(result.refusal);
    case 'not_applicant':
      return fail(403, 'NOT_APPLICANT', 'You can apply only in your own name');
    case 'quote_reserved_for_another_customer':
      return fail(
        403,
        'QUOTE_RESERVED_FOR_ANOTHER_CUSTOMER',
        'The quote is held for another customer'
      );
    case 'quote_expired':
      return fail(409, 'QUOTE_EXPIRED', 'The quote is no longer valid');
    case 'quote_not_yet_valid':
      return fail(409, 'QUOTE_NOT_YET_VALID', 'The quote is dated after today');
    case 'quote_in_use':
      return fail(409, 'QUOTE_IN_USE', 'The quote already has a pending or approved application', {
        applicationId: result.applicationId,
      });
    case 'incomplete_answers':
      return fail(400, 'INCOMPLETE_ANSWERS', 'A question is not answered', {
        questionId: result.questionId,
      });
    case 'invalid_answer':
      return fail(400, 'INVALID_ANSWER', 'An answer is not valid', {
        questionId: result.questionId,
        problem: result.problem,
      });
  }
});
