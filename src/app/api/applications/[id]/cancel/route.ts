// POST /api/applications/:id/cancel  body:   [?asOf=]
// The customer walks away before signing: holds released, items back to available.
import { fail, handleRoute, ok } from '@/server/api-response';
import { cancelApplication } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { requireCustomer } from '@/server/current-user';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/cancel'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const result = await cancelApplication(db, {
      applicationId: id,
      actor: user.actorId,
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
