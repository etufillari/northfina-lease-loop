// PUT /api/applications/:id/answers  body: { questionId, answer }
// Stores one answer (changing an earlier one drops every answer that stops applying) and
// returns the fresh state. An invalid business ID comes back as a warning, not a decline.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { answerQuestion } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { notYours } from '@/server/authz';
import { db } from '@/server/db';
import { requireCustomer } from '@/server/current-user';

const bodySchema = z.strictObject({
  questionId: z.string().regex(/^q_[a-z0-9_]+$/),
  answer: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const PUT = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/answers'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await answerQuestion(db, {
      applicationId: id,
      questionId: body.questionId,
      answer: body.answer,
      actor: user.actorId,
      asOf: await asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      if (result.reason === 'not_found')
        return fail(404, 'APPLICATION_NOT_FOUND', 'No such application');
      if (result.reason === 'not_a_draft')
        return fail(409, 'NOT_A_DRAFT', 'This application was already submitted');
      if (result.reason === 'invalid_answer') {
        return fail(422, 'INVALID_ANSWER', 'That answer does not fit this question');
      }
      return fail(422, 'QUESTION_NOT_APPLICABLE', 'This question does not apply right now');
    }
    return ok({ ...result.state, warning: result.warning ?? null });
  }
);
