import { fail, handleRoute, ok } from '@/server/api-response';
import { applicationResponse, getApplication } from '@/server/applications';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/applications/[id]'>) => {
    const { id } = await params;
    const application = await getApplication(db, id);
    if (!application) return fail(404, 'APPLICATION_NOT_FOUND', 'The application was not found');
    return ok(applicationResponse(application));
  }
);
