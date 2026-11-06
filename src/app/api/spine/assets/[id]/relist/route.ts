import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { relistAsset } from '@/server/spine-relist';
import { relistInputSchema } from '@/server/spine-shapes';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/assets/[id]/relist'>) => {
    checkRequestOrigin(request);
    const { id } = await params;
    const context = await readDemoContext(request);
    return ok(await relistAsset(db, context, id, await readJsonBody(request, relistInputSchema)));
  }
);
