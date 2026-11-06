import { joinWaitingInputSchema } from '@/data/waiting-list-schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { checkRequestOrigin, readDemoContext } from '@/server/demo-context';
import { joinWaitingList, listOwnWaitingRequests } from '@/server/waiting-list';

export const GET = handleRoute(async (request) =>
  ok(await listOwnWaitingRequests(db, await readDemoContext(request)))
);
export const POST = handleRoute(async (request) => {
  checkRequestOrigin(request);
  return ok(
    await joinWaitingList(
      db,
      await readDemoContext(request),
      await readJsonBody(request, joinWaitingInputSchema)
    )
  );
});
