// POST /api/contracts/:id/end-of-term: complete a contract as bought, returned or passed on.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { throwEndOfTermError } from '@/server/lifecycle/end-of-term-errors';
import { completeContract, endOfTermRequestSchema } from '@/server/lifecycle/end-of-term';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/end-of-term'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, endOfTermRequestSchema);
    const result = await completeContract(db, id, body);
    if (!result.ok) throwEndOfTermError(result);

    return ok({ contract: result.contract }, { status: 200 });
  }
);
