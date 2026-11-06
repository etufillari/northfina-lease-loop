import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { getPassport } from '@/server/spine-history';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/spine/assets/[id]/passport'>) => {
    const { id } = await params;
    return ok(await getPassport(db, id));
  }
);
