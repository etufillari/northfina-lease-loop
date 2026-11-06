import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { readDemoContext } from '@/server/demo-context';
import { listContracts } from '@/server/spine-views';

export const GET = handleRoute(async (request) =>
  ok(await listContracts(db, await readDemoContext(request)))
);
