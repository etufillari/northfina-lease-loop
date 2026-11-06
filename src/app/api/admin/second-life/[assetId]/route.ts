// POST /api/admin/second-life/:assetId
// body: { "conditionFound": "fair", "usageFound": 18400, "conditionAfter": "good",
//         "presetIds": ["tyres"], "customRepairs": [{ "label": "New saddle", "costCents": 2500 }],
//         "priceCents": 172700, "notes": "…" }
// Refurbishes a returned item and puts it back for its next life (admin page; like the rest of
// this demo there is no login). See src/server/second-life.ts.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { refurbishItem } from '@/server/second-life';

const bodySchema = z.strictObject({
  conditionFound: assetConditionSchema,
  usageFound: z.number().int().nonnegative().max(10_000_000),
  conditionAfter: assetConditionSchema,
  presetIds: z.array(z.string().max(50)).max(20),
  customRepairs: z
    .array(z.strictObject({ label: z.string().max(80), costCents: z.number().int().nonnegative() }))
    .max(20),
  priceCents: z.number().int().positive().max(100_000_000),
  notes: z.string().trim().max(2000).nullable(),
});

const failures = {
  later_history: [
    409,
    'LATER_HISTORY',
    'This item has later history: travel forward to its present to change it',
  ],
  not_found: [404, 'NOT_FOUND', 'Item not found'],
  not_returned: [409, 'NOT_RETURNED', 'Only a returned item can be refurbished'],
  invalid_usage: [422, 'INVALID_USAGE', 'The usage reading must be a whole, non-negative number'],
  invalid_repairs: [
    422,
    'INVALID_REPAIRS',
    'A repair is unknown for this item or has a bad name or price',
  ],
  cannot_downgrade: [422, 'CANNOT_DOWNGRADE', 'A refurbishment can’t make the condition worse'],
  cannot_reach_new: [422, 'CANNOT_REACH_NEW', 'A used item can’t be refurbished to new'],
  condition_too_low: [
    422,
    'CONDITION_TOO_LOW',
    'Needs at least good, or fair if someone waiting accepts fair',
  ],
  invalid_price: [422, 'INVALID_PRICE', 'The price must be a positive amount'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/admin/second-life/[assetId]'>) => {
    const { assetId } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await refurbishItem(
      db,
      { assetId, ...body, notes: body.notes || null, actor: 'admin' },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
