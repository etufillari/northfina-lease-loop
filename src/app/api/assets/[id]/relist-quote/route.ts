// GET /api/assets/:id/relist-quote?condition=good&usage=9800
// What a returned item would be worth, for a dealer to check before re-listing. Changes nothing.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { handleRoute, ok } from '@/server/api-response';
import { requireRole } from '@/server/auth/actor';
import { db } from '@/server/db';
import { previewRelist } from '@/server/second-life/relist';
import { relistFailure } from '@/server/second-life/relist-response';

const querySchema = z.strictObject({
  condition: assetConditionSchema,
  usage: z.coerce.number().int().nonnegative(),
});

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/relist-quote'>) => {
    await requireRole('second_life.refurbish');
    const { id } = await params;
    const searchParams = new URL(request.url).searchParams;
    const query = querySchema.parse(Object.fromEntries(searchParams));

    const result = await previewRelist(db, {
      assetId: id,
      condition: query.condition,
      usageValue: query.usage,
    });
    return result.ok ? ok(result.preview) : relistFailure(result, id);
  }
);
