// POST /api/assets/:id/relist   body: { "condition": "good", "usage_value": 9800 }
// Records what a dealer found on a returned item, prices it and puts it back on the market.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { identityId } from '@/domain/identity';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { requireRole } from '@/server/auth/actor';
import { db } from '@/server/db';
import { relistAsset } from '@/server/second-life/relist';
import { relistFailure } from '@/server/second-life/relist-response';

const bodySchema = z.strictObject({
  condition: assetConditionSchema,
  usage_value: z.number().int().nonnegative(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/relist'>) => {
    const actor = await requireRole('second_life.refurbish');
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await relistAsset(db, {
      assetId: id,
      condition: body.condition,
      usageValue: body.usage_value,
      actor: identityId(actor),
    });
    return result.ok ? ok(result.asset) : relistFailure(result, id);
  }
);
