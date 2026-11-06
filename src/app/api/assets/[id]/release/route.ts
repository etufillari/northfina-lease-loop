import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { releaseAsset } from '@/server/assets';
import { getActiveUser } from '@/server/active-user';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/release'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const activeUser = await getActiveUser();
    const actor = activeUser?.id ?? body.actor ?? 'anonymous';
    const result = await releaseAsset(db, { id, actor });

    if (!result.ok && result.reason === 'not_found') {
      return fail(404, 'ASSET_NOT_FOUND', 'The requested asset was not found');
    }
    if (!result.ok) {
      return fail(409, 'RESERVATION_NOT_OWNED', 'This reservation is no longer owned by you');
    }
    return ok(result.asset);
  }
);
