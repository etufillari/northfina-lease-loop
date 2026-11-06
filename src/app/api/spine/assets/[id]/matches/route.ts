import { matchingPreviewInputSchema } from '@/data/second-life-schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { previewSecondLife } from '@/server/second-life-matching';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/assets/[id]/matches'>) => {
    checkRequestOrigin(request);
    const { id } = await params;
    const context = await readDemoContext(request);
    return ok(
      await previewSecondLife(
        db,
        context,
        id,
        await readJsonBody(request, matchingPreviewInputSchema)
      )
    );
  }
);
