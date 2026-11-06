import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { readDemoContext } from '@/server/demo-context';
import { getScopedAudit } from '@/server/spine-history';

export const GET = handleRoute(async (request) =>
  ok(await getScopedAudit(db, await readDemoContext(request)))
);
