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
  /** Distinct asset ids: one item, or a fleet (same category) as one banded contract. */
  assetIds: z.array(z.string().min(1)).min(1).max(20),
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
      return fail(409, 'ASSET_UNAVAILABLE', 'An item in this group is reserved or out on a lease');
    }
    if (result.reason === 'mixed_categories') {
      return fail(422, 'MIXED_CATEGORIES', 'A fleet must be items of one category');
    }
    if (result.reason === 'duplicate_assets') {
      return fail(422, 'DUPLICATE_ASSETS', 'Each physical item can be in the group only once');
    }
    return fail(422, 'NOT_PRICEABLE', result.reason);
  }
  return ok(result.state, { status: 201 });
});
