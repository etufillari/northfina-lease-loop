// POST /api/holds/release   body: { "assetId": "ebike-007" }
// The customer changes their mind: withdraws their request for the item, or lets go of the
// item held for them (from a request or a pass-on they accepted). See src/server/holds.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { releaseHold } from '@/server/holds';

const bodySchema = z.strictObject({ assetId: z.string().trim().min(1).max(64) });

const failures = {
  not_found: [404, 'NOT_FOUND', 'Item not found'],
  later_history: [
    409,
    'LATER_HISTORY',
    'This item has later history: travel forward to its present to change it',
  ],
  nothing_to_release: [409, 'NOTHING_TO_RELEASE', 'Nothing is held or asked for you here'],
} as const;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const viewer = await currentViewer();
  if (viewer.kind !== 'customer') {
    return fail(403, 'CUSTOMERS_ONLY', 'Choose a customer in “Acting as”');
  }
  const result = await releaseHold(
    db,
    { assetId: body.assetId, customerId: viewer.customer.id, actor: viewer.customer.name },
    (await appDate()).today
  );
  if (!result.ok) {
    const [status, code, message] = failures[result.reason];
    return fail(status, code, message);
  }
  return ok(result);
});
