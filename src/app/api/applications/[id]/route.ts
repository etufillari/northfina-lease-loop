// GET /api/applications/:id  [?asOf=YYYY-MM-DD]
// The application's current state: visible questions, the next one, answers, prefill.
import { fail, handleRoute, ok } from '@/server/api-response';
import { getApplicationState } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]'>) => {
    const { id } = await params;
    const state = await getApplicationState(db, id, asOfFrom(request));
    if (!state) return fail(404, 'APPLICATION_NOT_FOUND', `No application with id "${id}"`);
    return ok(state);
  }
);
