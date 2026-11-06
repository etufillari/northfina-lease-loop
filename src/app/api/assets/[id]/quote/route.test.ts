// Runs the real handler against a real, migrated SQLite database, only swapping which one.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAssets } from '@/data/load';
import { seedAssets } from '@/server/assets/assets';
import type { PrismaClient } from '@/server/prisma-client';
import { todayIso } from '@/server/date/today';
import { AINO, TEST_SECRET, actAs } from '../../../../../../tests/helpers/act-as';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { GET } from './route';

const testDb = vi.hoisted(() => ({ current: undefined as PrismaClient | undefined }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/server/db', () => ({
  get db() {
    return testDb.current;
  },
}));

let cleanup: () => Promise<void>;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', TEST_SECRET);
  await actAs(null);
  const created = await createTestDb();
  testDb.current = created.db;
  cleanup = created.cleanup;
  await seedAssets(created.db, await loadAssets());
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});

async function getQuote(id: string, query: string) {
  const url = `http://localhost/api/assets/${id}/quote?${query}`;
  const response = await GET(new Request(url), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

describe('GET /api/assets/:id/quote', () => {
  it('returns the quote from card 1', async () => {
    const { status, body } = await getQuote('ebike-003', 'term=36&down=0&on=2026-11-05');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      asset_id: 'ebike-003',
      quote_date: '2026-11-05',
      financed_cents: 389_000,
      band: 'B',
      monthly_total_cents: 13_466,
      total_if_returned_cents: 386_280,
      total_if_bought_cents: 444_630,
    });
  });

  it('defaults to no down payment and today', async () => {
    const { status, body } = await getQuote('ebike-003', 'term=24');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ down_payment_cents: 0, quote_date: todayIso() });
  });

  it('uses the demo date when one is set, unless the request names a date', async () => {
    const setting = { key: 'demo_date', value: '2026-11-05' };
    await testDb.current?.appSetting.create({ data: setting });
    try {
      const byDemoDate = await getQuote('ebike-003', 'term=36');
      expect(byDemoDate.body.data).toMatchObject({
        quote_date: '2026-11-05',
        price_list_version: 1,
        base_price_cents: 389_000,
      });

      const byRequest = await getQuote('ebike-003', 'term=36&on=2026-11-06');
      expect(byRequest.body.data).toMatchObject({
        quote_date: '2026-11-06',
        price_list_version: 2,
        base_price_cents: 408_400,
      });
    } finally {
      await testDb.current?.appSetting.deleteMany();
    }
  });

  it('quotes an item held for someone only for that person', async () => {
    const asset = { where: { id: 'ebike-003' } };
    await testDb.current?.asset.update({ ...asset, data: { reserved_for: 'cust-aino' } });
    try {
      expect((await getQuote('ebike-003', 'term=36')).status).toBe(409);

      await actAs({ sub: 'cust-lena', role: 'client' });
      expect((await getQuote('ebike-003', 'term=36')).status).toBe(409);

      await actAs(AINO);
      expect((await getQuote('ebike-003', 'term=36')).status).toBe(200);
    } finally {
      await actAs(null);
      await testDb.current?.asset.update({ ...asset, data: { reserved_for: null } });
    }
  });

  it('answers 404 for an unknown asset', async () => {
    const { status, body } = await getQuote('nope', 'term=36');
    expect(status).toBe(404);
    expect(body.error.code).toBe('ASSET_NOT_FOUND');
  });

  it('answers 409 for a reserved asset', async () => {
    const { status, body } = await getQuote('ebike-009', 'term=36');
    expect(status).toBe(409);
    expect(body.error.code).toBe('ASSET_NOT_AVAILABLE');
  });

  it('answers 422 with the reason when the deal cannot be priced', async () => {
    const { status, body } = await getQuote('ebike-010', 'term=36&on=2026-11-05');
    expect(status).toBe(422);
    expect(body.error).toMatchObject({
      code: 'QUOTE_NOT_AVAILABLE',
      details: { reason: 'below_minimum', down_payment_limits: null },
    });
  });

  it('tells the slider which down payments work when the price is too high', async () => {
    const { status, body } = await getQuote('farm-006', 'term=48');
    expect(status).toBe(422);
    expect(body.error.details).toEqual({
      reason: 'above_maximum',
      down_payment_limits: { min_cents: 1_000_000, max_cents: 25_970_000 },
    });
  });

  it('includes the limits in a successful quote', async () => {
    const { body } = await getQuote('ebike-003', 'term=36&on=2026-11-05');
    expect(body.data.down_payment_limits).toEqual({ min_cents: 0, max_cents: 359_000 });
  });

  it.each([
    ['a missing term', ''],
    ['a term that is not a number', 'term=abc'],
    ['a negative down payment', 'term=36&down=-1'],
    ['a fraction of a cent', 'term=36&down=0.5'],
    ['a date in the wrong format', 'term=36&on=5.11.2026'],
    ['an unknown parameter', 'term=36&months=12'],
    ['quantity, which is no longer accepted', 'term=36&quantity=2'],
  ])('answers 400 for %s', async (_name, query) => {
    const { status, body } = await getQuote('ebike-003', query);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
