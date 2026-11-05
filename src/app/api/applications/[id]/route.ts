// GET /api/applications/:id
// The applicant sees their own application, and an admin sees any. Anyone else gets a 404,
// the same as for an id that does not exist, so ids cannot be probed.
import { can } from '@/domain/identity';
import { requireActor } from '@/server/auth/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getApplication, viewsOf } from '@/server/application/applications';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]'>) => {
    const actor = await requireActor();
    const { id } = await params;

    const application = await getApplication(db, id);
    const isOwner = actor.kind === 'customer' && actor.customer.id === application?.customer_id;
    const isReviewer = can(actor.role, 'application.decide_manual_review');
    if (!application || !(isOwner || isReviewer)) {
      return fail(404, 'APPLICATION_NOT_FOUND', `No application with id "${id}"`);
    }

    const [view] = await viewsOf([application]);
    return ok(view);
  }
);
