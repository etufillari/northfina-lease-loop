import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { markReturnReceived, markReturnReceivedSchema } from '@/server/returns';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[id]/receive'>) => {
    const { id } = await params;

    const body = await readJsonBody(request, markReturnReceivedSchema);

    const result = await markReturnReceived(db, id, body);

    return ok({
      returnRequest: result,
      assetStatusChanged: false,
    });
  }
);
