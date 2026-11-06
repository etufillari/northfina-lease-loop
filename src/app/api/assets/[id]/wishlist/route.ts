// POST /api/assets/:id/wishlist: customer requests this leased item for a future lease.
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { createWishlistRequest } from '@/server/wishlist';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  customerId: z.string().trim().min(1),
  minimumCondition: assetConditionSchema,
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/wishlist'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    return ok(
      await createWishlistRequest(db, {
        assetId: id,
        customerId: body.customerId,
        minimumCondition: body.minimumCondition,
        actor: body.customerId,
      }),
      { status: 201 }
    );
  }
);
