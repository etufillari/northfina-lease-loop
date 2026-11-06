// GET /api/contracts/:id
import { handleRoute, ok } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    return ok(await getContract(db, id));
  }
);
