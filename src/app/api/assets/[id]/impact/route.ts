// GET /api/assets/:id/impact?asOf=YYYY-MM-DD
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import {
  circularImpactQuerySchema,
  getAssetCircularImpact,
} from '@/server/second-life/circular-impact';
import { throwCircularImpactError } from '@/server/second-life/circular-impact-errors';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/impact'>) => {
    const { id } = await params;
    const input = circularImpactQuerySchema.parse({
      asOf: new URL(request.url).searchParams.get('asOf') ?? undefined,
    });
    const result = await getAssetCircularImpact(db, id, input);
    if (!result.ok) throwCircularImpactError(result);
    return ok({ asset: result.asset, impact: result.impact });
  }
);
