import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { readDemoContext } from '@/server/demo-context';
import { getContract } from '@/server/spine-views';

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/contracts/[id]'>) => {
    const { id } = await params;
    return ok(await getContract(db, await readDemoContext(request), id));
  }
);
