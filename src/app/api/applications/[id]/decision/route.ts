// POST /api/applications/:id/decision   body: { "decision": "approved" | "rejected" }
// An admin settles an application that is waiting for a person.
import { z } from 'zod';
import { identityId } from '@/domain/identity';
import { requireRole } from '@/server/auth/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { reviewApplication, viewsOf } from '@/server/application/applications';
import { db } from '@/server/db';

const bodySchema = z.strictObject({ decision: z.enum(['approved', 'rejected']) });

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/decision'>) => {
    const actor = await requireRole('application.decide_manual_review');
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await reviewApplication(db, {
      id,
      decision: body.decision,
      actor: identityId(actor),
    });
    if (!result.ok && result.reason === 'not_found') {
      return fail(404, 'APPLICATION_NOT_FOUND', `No application with id "${id}"`);
    }
    if (!result.ok) {
      return fail(409, 'APPLICATION_NOT_IN_REVIEW', 'This application is not waiting for review');
    }

    const [view] = await viewsOf([result.application]);
    return ok(view);
  }
);
