// POST /api/assets/:id/relist
// Relists a returned asset for its next lease life at its residual market value (`relist_price_cents`),
// recording an AssetEvent and an AuditLog entry in one transaction.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { relistAsset } from '@/server/assets';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100).default('customer'),
  asOf: isoDateSchema.optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/relist'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await relistAsset(db, {
      id,
      actor: body.actor,
      asOf: body.asOf,
    });

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
      }
      if (result.reason === 'not_returned') {
        return fail(409, 'ASSET_NOT_RETURNED', 'Only returned assets can be relisted');
      }
      if (result.reason === 'below_minimum') {
        return fail(
          422,
          'BELOW_MINIMUM',
          'Residual market value is below the minimum financeable amount'
        );
      }
      return fail(422, 'CONDITION_TOO_LOW', 'Asset condition is too low to relist');
    }

    return ok({
      asset: result.asset,
      relistPriceCents: result.valuation.relistPriceCents,
      topMatch: result.valuation.matches[0] ?? null,
    });
  }
);
