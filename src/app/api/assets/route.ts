// GET /api/assets[?category=e_bike|laptop|farm_machine]
import { handleRoute, ok } from '@/server/api-response';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { listAssetsQuerySchema } from '@/server/routes';

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const { category } = listAssetsQuerySchema.parse({
    category: searchParams.get('category') ?? undefined,
  });
  return ok(await listAssets(db, { category }));
});
