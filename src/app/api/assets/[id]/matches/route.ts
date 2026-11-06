// POST /api/assets/:id/matches: accept a waiting-list match and reserve the asset.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import {
  acceptSecondLifeMatch,
  secondLifeAcceptanceRequestSchema,
} from '@/server/second-life-matching';
import { throwSecondLifeError } from '@/server/second-life-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/matches'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, secondLifeAcceptanceRequestSchema);
    const result = await acceptSecondLifeMatch(db, id, body);
    if (!result.ok) throwSecondLifeError(result);

    return ok({ asset: result.asset, match: result.match }, { status: 201 });
  }
);
