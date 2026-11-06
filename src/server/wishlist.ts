import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assetConditionSchema, centsSchema, isoDateSchema } from '@/data/schemas';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';

const createWishlistRequestSchema = z.strictObject({
  assetId: z.string().min(1),
  customerId: z.string().trim().min(1),
  minimumCondition: assetConditionSchema,
  maxMonthlyNetRentCents: centsSchema,
  preferredTermMonths: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)]),
  neededBy: isoDateSchema,
  actor: z.string().trim().min(1),
});

export type CreateWishlistRequestInput = z.infer<typeof createWishlistRequestSchema>;

export async function createWishlistRequest(db: PrismaClient, input: CreateWishlistRequestInput) {
  const request = createWishlistRequestSchema.parse(input);
  const asset = await db.asset.findUnique({ where: { id: request.assetId } });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', 'This item does not exist.');
  if (asset.status !== 'reserved') {
    throw new ApiError(
      409,
      'WISHLIST_ONLY_FOR_LEASED_ASSETS',
      'A wishlist request is only needed for an item currently leased to another customer.'
    );
  }

  const id = randomUUID();
  return withAudit(
    db,
    {
      actor: request.actor,
      action: 'wishlist.requested',
      entityType: 'wishlist_request',
      entityId: id,
      details: {
        assetId: asset.id,
        customerId: request.customerId,
        minimumCondition: request.minimumCondition,
        maxMonthlyNetRentCents: request.maxMonthlyNetRentCents,
        preferredTermMonths: request.preferredTermMonths,
        neededBy: request.neededBy,
      },
    },
    async (tx) => {
      const existing = await tx.wishlistRequest.findFirst({
        where: {
          asset_id: asset.id,
          customer_id: request.customerId,
          status: 'requested',
        },
      });
      if (existing) {
        throw new ApiError(
          409,
          'WISHLIST_REQUEST_ALREADY_OPEN',
          'This customer already has an open wishlist request for this item.'
        );
      }
      return tx.wishlistRequest.create({
        data: {
          id,
          asset_id: asset.id,
          customer_id: request.customerId,
          minimum_condition: request.minimumCondition,
          max_monthly_net_rent_cents: request.maxMonthlyNetRentCents,
          preferred_term_months: request.preferredTermMonths,
          needed_by: request.neededBy,
          status: 'requested',
        },
      });
    }
  );
}

export async function listWishlistRequests(db: PrismaClient) {
  return db.wishlistRequest.findMany({
    where: { status: 'requested' },
    include: { asset: true },
    orderBy: [{ asset_id: 'asc' }, { created_at: 'asc' }],
  });
}
