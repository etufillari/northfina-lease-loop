// POST /api/contracts/:id/early-exit/quote
// body: { action, requestedOn }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { earlyExitQuoteRequestSchema, quoteEarlyExit } from '@/server/lifecycle/early-exit';
import { throwEarlyExitError } from '@/server/lifecycle/early-exit-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit/quote'>) => {
    const input = await readJsonBody(request, earlyExitQuoteRequestSchema);
    const { id } = await params;
    const result = await quoteEarlyExit(db, id, input);
    if (!result.ok) throwEarlyExitError(result);
    return ok({ quote: result.quote });
  }
);
