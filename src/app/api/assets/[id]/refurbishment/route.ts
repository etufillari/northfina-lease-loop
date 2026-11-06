// POST /api/assets/:id/refurbishment: accept a quote and make the returned asset available.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import {
  completeRefurbishment,
  refurbishmentCompletionRequestSchema,
} from '@/server/refurbishment';
import { throwRefurbishmentError } from '@/server/refurbishment-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/refurbishment'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, refurbishmentCompletionRequestSchema);
    const result = await completeRefurbishment(db, id, body);
    if (!result.ok) throwRefurbishmentError(result);

    return ok({ asset: result.asset, quote: result.quote }, { status: 200 });
  }
);
