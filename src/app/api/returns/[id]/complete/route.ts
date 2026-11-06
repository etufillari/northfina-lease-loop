import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { completeReturn, completeReturnSchema } from '@/server/return-completion';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[id]/complete'>) => {
    const { id } = await params;

    const body = await readJsonBody(request, completeReturnSchema);

    const result = await completeReturn(db, id, body);

    return ok({ returnRequest: result });
  }
);
