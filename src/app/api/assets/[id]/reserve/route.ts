import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { reserveAsset } from '@/server/assets';
import { db } from '@/server/db';
import { getActiveUser } from '@/server/active-user';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/reserve'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const activeUser = await getActiveUser();
    const actor = activeUser?.id ?? body.actor ?? 'anonymous';
    const result = await reserveAsset(db, { id, actor, now: new Date() });

    if (!result.ok && result.reason === 'not_found') {
      return fail(404, 'ASSET_NOT_FOUND', 'The requested asset was not found');
    }
    if (!result.ok) {
      return fail(409, 'ASSET_UNAVAILABLE', 'This item is currently reserved by someone else');
    }
    return ok({ asset: result.asset, reservedUntil: result.reservedUntil });
  }
);
