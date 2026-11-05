// PUT /api/applications/:id/answers  body: { questionId, answer, actor }
// Stores one answer (changing an earlier one drops every answer that stops applying) and
// returns the fresh state. An invalid business ID comes back as a warning, not a decline.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { answerQuestion } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  questionId: z.string().regex(/^q_[a-z0-9_]+$/),
  answer: z.union([z.string(), z.number(), z.array(z.string())]),
  actor: z.string().trim().min(1).max(100),
});

export const PUT = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/answers'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await answerQuestion(db, {
      applicationId: id,
      questionId: body.questionId,
      answer: body.answer,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_found')
        return fail(404, 'APPLICATION_NOT_FOUND', 'No such application');
      if (result.reason === 'not_a_draft')
        return fail(409, 'NOT_A_DRAFT', 'This application was already submitted');
      return fail(422, 'QUESTION_NOT_APPLICABLE', 'This question does not apply right now');
    }
    return ok({ ...result.state, warning: result.warning ?? null });
  }
);
