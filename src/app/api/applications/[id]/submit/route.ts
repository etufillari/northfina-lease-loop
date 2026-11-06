// POST /api/applications/:id/submit  body: { startDate, actor }
// The decision: yes / no / manual review with reasons; a 7-day hold unless declined.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { submitApplication } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  startDate: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/submit'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await submitApplication(db, {
      applicationId: id,
      startDate: body.startDate,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_found')
        return fail(404, 'APPLICATION_NOT_FOUND', 'No such application');
      if (result.reason === 'not_a_draft')
        return fail(409, 'NOT_A_DRAFT', 'This application was already submitted');
      if (result.reason === 'incomplete')
        return fail(422, 'INCOMPLETE', 'Some questions are still unanswered');
      if (result.reason === 'bad_start_date')
        return fail(
          422,
          'BAD_START_DATE',
          'The start date must be from today up to 3 months ahead'
        );
      return fail(422, 'NO_VAT_RATE', 'No VAT rate is known for this date');
    }
    return ok(result.state);
  }
);
