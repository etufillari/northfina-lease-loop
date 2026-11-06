// POST /api/second-life/pools/:waiterId/release  body: { actor }  [?asOf=]
// Releases the items held for a multi-item waiter once their deadline has passed without the
// set filling up. The items are already refurbished, so they go to the catalogue.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { releasePool } from '@/server/second-life-pools';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/second-life/pools/[waiterId]/release'>) => {
    const { waiterId } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await releasePool(db, {
      waiterId,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return fail(404, 'WAITER_NOT_FOUND', `No waiting-list entry "${waiterId}"`);
      }
      if (result.reason === 'no_pool') {
        return fail(409, 'NO_POOL', 'Nothing is being held for this waiting-list entry');
      }
      return fail(409, 'POOL_NOT_EXPIRED', 'The waiter’s deadline has not passed yet');
    }
    return ok(result);
  }
);
