// POST /api/assets/:id/release
// Ends the hold on a passed-on item, when the person it was held for did not take it.
import { identityId } from '@/domain/identity';
import { fail, handleRoute, ok } from '@/server/api-response';
import { requireRole } from '@/server/auth/actor';
import { db } from '@/server/db';
import { releaseAsset } from '@/server/second-life/relist';

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/assets/[id]/release'>) => {
    const actor = await requireRole('second_life.refurbish');
    const { id } = await params;

    const result = await releaseAsset(db, { assetId: id, actor: identityId(actor) });
    if (result.ok) return ok(result.asset);
    return result.reason === 'asset_not_found'
      ? fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`)
      : fail(409, 'ASSET_NOT_HELD', 'This item is not being held for anyone');
  }
);
