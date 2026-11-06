// POST /api/applications/:id/decision   body: { decision: "approved" | "rejected" }
// D10: an admin decides a manual review. An awaiting_signatory case is signed or declined only
// through the signing link (POST /api/sign/:token, D39, D46): here it is 403 FORBIDDEN
// `signatory_required` for everyone. Authorized first (D73, D74); the actor is the cookie's, and
// so is the reviewer stored with the decision (review finding 13: never the body's).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { decideApplication } from '@/server/applications';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { applicationIdParamsSchema, decideApplicationBodySchema } from '@/server/routes';

const notFound = () => fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id');

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/decision'>) => {
    const { id } = applicationIdParamsSchema.parse(await params);
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'decide_application', { application: id });
    if (!auth.ok) return refusalResponse(auth.reason, notFound);
    const body = await readJsonBody(request, decideApplicationBodySchema);
    const today = await todayForRequest();

    const result = await decideApplication(db, {
      id,
      decision: body.decision,
      reviewedBy: actor,
      today,
      actor,
    });
    if (result.ok) return ok(result.application);

    if (result.reason === 'forbidden') return forbiddenResponse(result.refusal);
    return result.reason === 'not_found'
      ? notFound()
      : fail(409, 'APPLICATION_NOT_PENDING', 'The application is already decided');
  }
);
