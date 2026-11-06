// POST /api/contracts/:id/early-exit/process
// body: { processedOn, settlementPaidCents, actor }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { earlyExitProcessRequestSchema, processEarlyExit } from '@/server/early-exit';
import { throwEarlyExitError } from '@/server/early-exit-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit/process'>) => {
    const input = await readJsonBody(request, earlyExitProcessRequestSchema);
    const { id } = await params;
    const result = await processEarlyExit(db, id, input);
    if (!result.ok) throwEarlyExitError(result);
    return ok({ termination: result.termination });
  }
);
