import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { ADMIN, AINO, DEALER, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { resetLeaseData } from '../../../../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { GET } from './route';

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

async function preview(id: string, query: string) {
  const request = new Request(`http://localhost/api/assets/${id}/relist-quote?${query}`);
  const response = await GET(request, { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

const good = 'condition=good&usage=9800';

describe('GET /api/assets/:id/relist-quote', () => {
  it.each([
    ['a dealer', DEALER],
    ['an admin', ADMIN],
  ])('shows %s the value, and changes nothing', async (_name, user) => {
    await actAs(user);
    const { status, body } = await preview('ebike-008', good);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      asset_id: 'ebike-008',
      market_value_cents: 34_482,
      age_months: 55,
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    expect(asset.status).toBe('returned');
    expect(asset.relist_price_cents).toBeNull();
  });

  it('answers 422 with the value for a condition below good', async () => {
    await actAs(DEALER);
    const { status, body } = await preview('ebike-007', 'condition=fair&usage=18400');
    expect(status).toBe(422);
    expect(body.error).toMatchObject({
      code: 'CONDITION_TOO_LOW',
      details: { market_value_cents: 101_345 },
    });
  });

  it('answers 409 for an item that is not returned, and 404 for an unknown one', async () => {
    await actAs(DEALER);
    const leased = await preview('ebike-003', good);
    expect(leased.status).toBe(409);
    expect(leased.body.error.code).toBe('ASSET_NOT_RETURNED');
    expect((await preview('nope', good)).status).toBe(404);
  });

  it('is closed to clients and the logged out', async () => {
    await actAs(AINO);
    expect((await preview('ebike-008', good)).status).toBe(403);
    await actAs(null);
    expect((await preview('ebike-008', good)).status).toBe(401);
  });

  it.each([
    ['a missing condition', 'usage=9800'],
    ['an unknown condition', 'condition=mint&usage=9800'],
    ['missing usage', 'condition=good'],
    ['negative usage', 'condition=good&usage=-1'],
    ['an unknown parameter', `${good}&price=1`],
  ])('answers 400 for %s', async (_name, query) => {
    await actAs(DEALER);
    const { status, body } = await preview('ebike-008', query);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
