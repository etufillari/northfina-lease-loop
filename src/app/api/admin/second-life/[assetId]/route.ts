// POST /api/admin/second-life/:assetId
// body: { "conditionAfter": "good", "extraCostCents": 0, "priceCents": 172700, "notes": "…" }
// Refurbishes a returned item and puts it back for its next life. Staff only; see
// src/server/second-life.ts.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { refurbishItem } from '@/server/second-life';

const bodySchema = z.strictObject({
  conditionAfter: assetConditionSchema,
  extraCostCents: z.number().int().nonnegative().max(100_000_000),
  priceCents: z.number().int().positive().max(100_000_000),
  notes: z.string().trim().max(2000).nullable(),
});

const failures = {
  not_found: [404, 'NOT_FOUND', 'Item not found'],
  not_returned: [409, 'NOT_RETURNED', 'Only a returned item can be refurbished'],
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
    if ((await currentViewer()).kind !== 'staff') {
      return fail(403, 'STAFF_ONLY', 'Only Lease Loop staff can refurbish items');
    }
    const { assetId } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await refurbishItem(
      db,
      { assetId, ...body, notes: body.notes || null, actor: 'Lease Loop staff' },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
