// GET /api/assets[?category=e_bike|laptop|farm_machine]
// Each viewer sees held items as they apply to them: see `assetForViewer`.
import { z } from 'zod';
import { assetCategorySchema } from '@/data/schemas';
import { assetForViewer } from '@/domain/assets/status';
import { actingCustomerId } from '@/domain/identity';
import { handleRoute, ok } from '@/server/api-response';
import { listAssets } from '@/server/assets/assets';
import { getActor } from '@/server/auth/actor';
import { db } from '@/server/db';

const querySchema = z.object({ category: assetCategorySchema.optional() });

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const { category } = querySchema.parse({ category: searchParams.get('category') ?? undefined });
  const [assets, actor] = await Promise.all([listAssets(db, { category }), getActor()]);
  const viewerId = actor ? actingCustomerId(actor) : undefined;
  return ok(assets.map((asset) => assetForViewer(asset, viewerId)));
});
