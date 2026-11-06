import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { resetLeaseData } from '../../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { POST } from './route';

const testDb = vi.hoisted(() => ({ current: undefined as PrismaClient | undefined }));
vi.mock('@/server/db', () => ({
  get db() {
    return testDb.current;
  },
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET);
  ({ db, cleanup } = await createTestDb());
  testDb.current = db;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
});

async function relist(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/assets/${id}/relist`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

const good = { condition: 'good', usage_value: 9_800 };

describe('POST /api/assets/:id/relist', () => {
  it.each([
    ['a dealer', DEALER, 'staff-dealer'],
    ['an admin', ADMIN, 'staff-admin'],
  ])('lets %s re-list a returned item', async (_name, user, actor) => {
    await actAs(user);
    const { status, body } = await relist('ebike-008', good);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      id: 'ebike-008',
      status: 'available',
      condition: 'good',
      relist_price_cents: 34_482,
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'asset.relisted' } });
    expect(audit.actor).toBe(actor);
  });

  it.each([
    ['fair', 'CONDITION_TOO_LOW', 101_345],
    ['poor', 'CONDITION_TOO_LOW', 62_366],
  ])('answers 422 for a %s item', async (condition, code, value) => {
    await actAs(DEALER);
    const { status, body } = await relist('ebike-007', { condition, usage_value: 18_400 });
    expect(status).toBe(422);
    expect(body.error).toMatchObject({ code, details: { market_value_cents: value } });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    expect(asset.status).toBe('returned');
  });

  it('answers 422 for a value under the minimum', async () => {
    await db.asset.update({
      where: { id: 'ebike-008' },
      data: { first_lease_price_cents: 40_000 },
    });
    await actAs(DEALER);
    const { status, body } = await relist('ebike-008', { condition: 'good', usage_value: 20_000 });
    expect(status).toBe(422);
    expect(body.error.code).toBe('PRICE_BELOW_MINIMUM');
  });

  it('answers 422 for an item with no known first lease', async () => {
    await db.asset.update({
      where: { id: 'ebike-008' },
      data: { first_leased_on: null, first_lease_price_cents: null },
    });
    await actAs(DEALER);
    const { status, body } = await relist('ebike-008', good);
    expect(status).toBe(422);
    expect(body.error.code).toBe('FIRST_LEASE_UNKNOWN');
  });

  it('answers 409 for a second re-list, and for an item that is not returned', async () => {
    await actAs(DEALER);
    await relist('ebike-008', good);
    const again = await relist('ebike-008', good);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ASSET_NOT_RETURNED');
    expect((await relist('ebike-003', good)).status).toBe(409);
  });

  it('answers 404 for an unknown item', async () => {
    await actAs(DEALER);
    const { status, body } = await relist('nope', good);
    expect(status).toBe(404);
    expect(body.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('is closed to clients and the logged out', async () => {
    await actAs(AINO);
    expect((await relist('ebike-008', good)).status).toBe(403);
    await actAs(null);
    expect((await relist('ebike-008', good)).status).toBe(401);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    expect(asset.status).toBe('returned');
  });

  it.each([
    ['a missing condition', { usage_value: 9_800 }],
    ['an unknown condition', { condition: 'mint', usage_value: 9_800 }],
    ['fractional usage', { condition: 'good', usage_value: 1.5 }],
    ['a price from the client', { ...good, relist_price_cents: 1 }],
  ])('answers 400 for %s', async (_name, body) => {
    await actAs(DEALER);
    const result = await relist('ebike-008', body);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
});
