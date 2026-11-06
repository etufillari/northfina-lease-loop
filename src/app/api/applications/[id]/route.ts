// GET /api/applications/:id   The application with its decision and reasons (codes with params).
// Authorized first (D73): anonymous is 401; anyone but the applicant customer or the admin gets
// the same 404 as for an id that does not exist (D57), so the answer never tells whether the
// application exists.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getApplication } from '@/server/applications';
import { authorize, forbiddenResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { applicationIdParamsSchema } from '@/server/routes';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]'>) => {
    const { id } = applicationIdParamsSchema.parse(await params);
    const actor = await readActor(db);
    const notFound = fail(404, 'APPLICATION_NOT_FOUND', 'No application with that id');
    const auth = await authorize(db, actor, 'read_application', { application: id });
    if (!auth.ok) {
      return auth.reason.code === 'not_signed_in' ? forbiddenResponse(auth.reason) : notFound;
    }
    const application = await getApplication(db, id);
    return application ? ok(application) : notFound;
  }
);
