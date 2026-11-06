// POST /api/applications/:id/cancel  body: { actor }  [?asOf=]
// The customer walks away before signing: holds released, items back to available.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { cancelApplication } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/cancel'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await cancelApplication(db, {
      applicationId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_found')
        return fail(404, 'APPLICATION_NOT_FOUND', 'No such application');
      if (result.reason === 'not_yours')
        return fail(403, 'NOT_YOURS', 'Only the applicant can cancel this application');
      return fail(409, 'NOT_CANCELLABLE', 'This application can no longer be cancelled');
    }
    return ok(result.state);
  }
);
