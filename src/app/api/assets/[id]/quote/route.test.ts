// Runs the real handler against a real, migrated SQLite database, only swapping which one.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAssets } from '@/data/load';
import { seedAssets } from '@/server/assets';
import type { PrismaClient } from '@/server/prisma-client';
import { todayIso } from '@/server/today';
import { createTestDb } from '../../../../../../tests/helpers/test-db';
import { GET } from './route';

const testDb = vi.hoisted(() => ({ current: undefined as PrismaClient | undefined }));
vi.mock('@/server/db', () => ({
  get db() {
    return testDb.current;
  },
}));

let cleanup: () => Promise<void>;

beforeAll(async () => {
  const created = await createTestDb();
  testDb.current = created.db;
  cleanup = created.cleanup;
  await seedAssets(created.db, await loadAssets());
});
afterAll(async () => {
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
      total_net_cost_cents: 444_630,
    });
  });

  it('defaults to no down payment and today', async () => {
    const { status, body } = await getQuote('ebike-003', 'term=24');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ down_payment_cents: 0, quote_date: todayIso() });
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
  ])('answers 400 for %s', async (_name, query) => {
    const { status, body } = await getQuote('ebike-003', query);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
