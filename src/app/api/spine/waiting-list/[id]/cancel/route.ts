import { z } from 'zod';
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { cancelWaitingRequest } from '@/server/waiting-list';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/spine/waiting-list/[id]/cancel'>) => {
    checkRequestOrigin(request);
    const { id } = await params;
    return ok(await cancelWaitingRequest(db, await readDemoContext(request), z.uuid().parse(id)));
  }
);
