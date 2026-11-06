// POST /api/contracts/:id/pass-on/preview: who can take the item next, without changing state.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { throwEndOfTermError } from '@/server/lifecycle/end-of-term-errors';
import { passOnPreviewRequestSchema, previewPassOn } from '@/server/lifecycle/pass-on';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/pass-on/preview'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, passOnPreviewRequestSchema);
    const result = await previewPassOn(db, id, body);
    if (!result.ok) throwEndOfTermError(result);

    return ok({
      mandatorySteps: result.mandatorySteps,
      waitingList: result.waitingList,
      named: result.named,
    });
  }
);
