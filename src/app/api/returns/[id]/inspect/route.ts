import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { inspectReturn, inspectReturnSchema } from '@/server/returns';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[id]/inspect'>) => {
    const { id } = await params;

    const body = await readJsonBody(request, inspectReturnSchema);

    const result = await inspectReturn(db, id, body);

    return ok({
      returnRequest: result,
      assetStatusChanged: false,
    });
  }
);
