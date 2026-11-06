import { z } from 'zod';
import { updateWaitingInputSchema } from '@/data/waiting-list-schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { updateWaitingRequest } from '@/server/waiting-list-update';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/waiting-list/[id]/update'>) => {
    checkRequestOrigin(request);
    const { id } = await params;
    return ok(
      await updateWaitingRequest(
        db,
        await readDemoContext(request),
        z.uuid().parse(id),
        await readJsonBody(request, updateWaitingInputSchema)
      )
    );
  }
);
