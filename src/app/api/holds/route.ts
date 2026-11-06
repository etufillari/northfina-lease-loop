// POST /api/holds   body: { "assetId": "ebike-007", "termMonths": 24, "maxMonthlyCents": 9000,
//                           "minCondition": "good" }
// A customer (chosen in "Acting as") asks for an item that isn't free yet to be held for them,
// with what they need from it. See src/server/holds.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { requestHold } from '@/server/holds';

const bodySchema = z.strictObject({
  assetId: z.string().trim().min(1).max(64),
  termMonths: z.number().int().positive().max(120),
  maxMonthlyCents: z.number().int().positive(),
  minCondition: z.string().max(20),
});

const failures = {
  not_found: [404, 'NOT_FOUND', 'Item not found'],
  later_history: [
    409,
    'LATER_HISTORY',
    'This item has later history: travel forward to its present to change it',
  ],
  not_holdable: [
    409,
    'NOT_HOLDABLE',
    'Only a leased item, or one waiting for its check, can be held',
  ],
  already_requested: [409, 'ALREADY_REQUESTED', 'You have already asked for this item'],
  unknown_term: [422, 'UNKNOWN_TERM', 'Choose a lease term on offer'],
  invalid_budget: [422, 'INVALID_BUDGET', 'The monthly budget must be a positive amount'],
  unknown_condition: [422, 'UNKNOWN_CONDITION', 'Choose a condition'],
} as const;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const viewer = await currentViewer();
  if (viewer.kind !== 'customer') {
    return fail(403, 'CUSTOMERS_ONLY', 'Choose a customer in “Acting as” to ask for an item');
  }
  const result = await requestHold(
    db,
    { ...body, customerId: viewer.customer.id, actor: viewer.customer.name },
    (await appDate()).today
  );
  if (!result.ok) {
    const [status, code, message] = failures[result.reason];
    return fail(status, code, message);
  }
  return ok(result.request, { status: 201 });
});
