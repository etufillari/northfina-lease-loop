// GET /api/assets/:id
// One item, as this viewer may see it, the same as in the list: see `assetForViewer`.
import { assetForViewer } from '@/domain/assets/status';
import { actingCustomerId } from '@/domain/identity';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getAsset } from '@/server/assets/assets';
import { getActor } from '@/server/auth/actor';
import { db } from '@/server/db';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/assets/[id]'>) => {
  const { id } = await params;

  const [asset, actor] = await Promise.all([getAsset(db, id), getActor()]);
  if (!asset) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

  return ok(assetForViewer(asset, actor ? actingCustomerId(actor) : undefined));
});
