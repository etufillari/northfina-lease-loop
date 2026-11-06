// GET /api/second-life  [?asOf=]
// The returns desk: the second-life decision for every asset in `returned`.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { listReturnedDecisions } from '@/server/second-life';

export const GET = handleRoute(async (request) =>
  ok(await listReturnedDecisions(db, await asOfFrom(request)))
);
