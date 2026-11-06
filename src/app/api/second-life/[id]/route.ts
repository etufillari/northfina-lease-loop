// GET /api/second-life/:id  [?asOf=]
// The second-life decision for one returned asset, with the whole reasoning. Changes nothing.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { previewSecondLife } from '@/server/second-life';
import { secondLifeFailure } from './failure';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/second-life/[id]'>) => {
    const { id } = await params;
    const result = await previewSecondLife(db, id, asOfFrom(request));
    if (!result.ok) return secondLifeFailure(result.reason, id);
    return ok(result.preview);
  }
);
