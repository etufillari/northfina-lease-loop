// POST /api/assets/:id/relist   body: { "target": "fair" }
// Refurbishes a returned item to `target`, gives it its second-life price and makes it available,
// with an audit row in the same transaction (D-035). The server values it again from the data.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfDate } from '@/server/as-of';
import { db } from '@/server/db';
import { loadSecondLifeDataPack, relistAsset } from '@/server/second-life';

const bodySchema = z.strictObject({ target: assetConditionSchema });

const statusFor = { asset_not_found: 404, asset_not_returned: 409, target_not_allowed: 422 };

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/relist'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await relistAsset(db, await loadSecondLifeDataPack(), {
      assetId: id,
      target: body.target,
      today: await asOfDate(),
      // No login in the starter: the back office re-lists.
      actor: 'back-office',
    });
    if (!result.ok) {
      return fail(
        statusFor[result.reason],
        result.reason.toUpperCase(),
        'The item cannot be re-listed'
      );
    }
    return ok(
      { asset: result.asset, listingId: result.listingId, valuation: result.valuation },
      { status: 201 }
    );
  }
);
