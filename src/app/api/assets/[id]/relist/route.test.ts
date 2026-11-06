import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { seedAssets } from '@/server/assets';
import type { PrismaClient } from '@/server/prisma-client';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { POST } from './route';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.assetEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

function post(id: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/assets/${id}/relist`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('POST /api/assets/[id]/relist', () => {
  it('relists ebike-007 (Card 9) and returns the new relist price and top waiting-list match', async () => {
    const res = await post('ebike-007', { actor: 'dealer', asOf: '2026-11-05' });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        asset: { id: 'ebike-007', status: 'available', relist_price_cents: 92_781 },
        relistPriceCents: 92_781,
        topMatch: {
          request: { id: 'wait-02' },
          monthlyNetRentCents: 5198,
        },
      },
    });
  });

  it('returns 422 BELOW_MINIMUM for laptop-006', async () => {
    const res = await post('laptop-006', { actor: 'dealer', asOf: '2026-11-05' });
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error.code).toBe('BELOW_MINIMUM');
  });

  it('returns 409 ASSET_NOT_RETURNED for an available asset and 404 for unknown', async () => {
    const notReturned = await post('ebike-001', { actor: 'dealer' });
    expect(notReturned.status).toBe(409);

    const notFound = await post('nope', { actor: 'dealer' });
    expect(notFound.status).toBe(404);
  });
});
