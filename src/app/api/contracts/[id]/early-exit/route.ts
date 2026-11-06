// POST /api/contracts/:id/early-exit
// body: { action, requestedOn, actor }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { earlyExitCreationRequestSchema, requestEarlyExit } from '@/server/early-exit';
import { throwEarlyExitError } from '@/server/early-exit-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit'>) => {
    const input = await readJsonBody(request, earlyExitCreationRequestSchema);
    const { id } = await params;
    const result = await requestEarlyExit(db, id, input);
    if (!result.ok) throwEarlyExitError(result);
    return ok({ request: result.request }, { status: 202 });
  }
);
