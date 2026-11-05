// POST /api/applications  body: { assetId, quantity?, downPaymentCents, termMonths,
//                                 customerId, actor }  [?asOf=YYYY-MM-DD]
// Persists the quote (its date is what the price lock hangs on) and opens a draft
// application; the response carries the first visible questions.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { startApplication } from '@/server/applications';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  assetId: z.string().min(1),
  quantity: z.number().int().positive().max(100).default(1),
  downPaymentCents: z.number().int().nonnegative(),
  termMonths: z.number().int().positive(),
  customerId: z.string().min(1),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const result = await startApplication(db, { ...body, asOf: asOfFrom(request) });
  if (!result.ok) {
    if (result.reason === 'unknown_asset') return fail(404, 'ASSET_NOT_FOUND', 'No such asset');
    if (result.reason === 'asset_unavailable') {
      return fail(409, 'ASSET_UNAVAILABLE', 'This item is reserved or out on a lease');
    }
    return fail(422, 'NOT_PRICEABLE', result.reason);
  }
  return ok(result.state, { status: 201 });
});
