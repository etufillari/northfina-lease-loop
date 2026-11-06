import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { getReturnRequest } from '@/server/return-queries';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/returns/[id]'>) => {
  const { id } = await params;

  return ok({ returnRequest: await getReturnRequest(db, id) });
});
