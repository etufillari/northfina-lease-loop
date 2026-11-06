// POST /api/assets/:id/matches/preview: rank waiting-list requests without changing state.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import {
  previewSecondLifeMatches,
  secondLifePreviewRequestSchema,
} from '@/server/second-life/second-life-matching';
import { throwSecondLifeError } from '@/server/second-life/second-life-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/matches/preview'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, secondLifePreviewRequestSchema);
    const result = await previewSecondLifeMatches(db, id, body);
    if (!result.ok) throwSecondLifeError(result);

    return ok(result.preview);
  }
);
