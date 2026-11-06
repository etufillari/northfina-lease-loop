import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { planReturn, planReturnSchema } from '@/server/returns';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[id]/plan'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, planReturnSchema);

    const result = await planReturn(db, id, body);

    return ok({
      returnRequest: result,
      assetUpdated: false,
    });
  }
);
