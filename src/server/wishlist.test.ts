import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import { createWishlistRequest, listWishlistRequests } from './wishlist';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.wishlistRequest.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

function errorCode(promise: Promise<unknown>) {
  return promise.then(
    () => 'NO_ERROR',
    (error: unknown) => (error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR')
  );
}

describe('wishlist requests', () => {
  it('creates an audited request for a leased asset', async () => {
    const result = await createWishlistRequest(db, {
      assetId: 'ebike-009',
      customerId: 'cust-pekka',
      minimumCondition: 'good',
      maxMonthlyNetRentCents: 20_000,
      preferredTermMonths: 24,
      neededBy: '2027-01-01',
      actor: 'cust-pekka',
    });

    expect(result).toMatchObject({
      asset_id: 'ebike-009',
      customer_id: 'cust-pekka',
      minimum_condition: 'good',
      status: 'requested',
    });
    expect(await db.auditLog.findFirst({ where: { entity_id: result.id } })).toMatchObject({
      action: 'wishlist.requested',
      entity_type: 'wishlist_request',
    });
  });

  it('rejects available assets and duplicate customer requests', async () => {
    const input = {
      assetId: 'ebike-009',
      customerId: 'cust-pekka',
      minimumCondition: 'fair' as const,
      maxMonthlyNetRentCents: 20_000,
      preferredTermMonths: 24 as const,
      neededBy: '2027-01-01',
      actor: 'cust-pekka',
    };
    await createWishlistRequest(db, input);
    expect(await errorCode(createWishlistRequest(db, input))).toBe('WISHLIST_REQUEST_ALREADY_OPEN');
    expect(
      await errorCode(
        createWishlistRequest(db, { ...input, assetId: 'ebike-001', customerId: 'cust-aino' })
      )
    ).toBe('WISHLIST_ONLY_FOR_LEASED_ASSETS');
  });

  it('lists only open requests with the leased asset', async () => {
    await createWishlistRequest(db, {
      assetId: 'ebike-009',
      customerId: 'cust-pekka',
      minimumCondition: 'like_new',
      maxMonthlyNetRentCents: 20_000,
      preferredTermMonths: 36,
      neededBy: '2027-01-01',
      actor: 'cust-pekka',
    });

    const [request] = await listWishlistRequests(db);
    expect(request).toMatchObject({
      asset_id: 'ebike-009',
      asset: { id: 'ebike-009', status: 'reserved' },
    });
  });
});
