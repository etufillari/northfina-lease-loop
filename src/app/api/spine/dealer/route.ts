import { ApiError, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { readDemoContext } from '@/server/demo-context';
import { getDealerWorkspace } from '@/server/spine-dealer';

export const GET = handleRoute(async (request) => {
  const assetId = new URL(request.url).searchParams.get('assetId');
  if (!assetId) throw new ApiError(400, 'ASSET_NOT_FOUND', 'Choose an item');
  return ok(await getDealerWorkspace(db, await readDemoContext(request), assetId));
});
