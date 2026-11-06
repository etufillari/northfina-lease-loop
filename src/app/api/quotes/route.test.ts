// POST /api/quotes answers a term over the category's cap (D43) as the refusal envelope every
// pricing refusal uses: 422 `QUOTE_REFUSED` with the code and params in `details`. Against a
// real, migrated SQLite database: the app's `db` module is pointed at it, nothing else is replaced.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../../../tests/helpers/test-db';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));
// No actor cookie and no demo clock: the default actor on the real day.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { POST } = await import('./route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});

async function post(body: unknown) {
  const request = new Request('http://localhost/api/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json() };
}

describe('POST /api/quotes and the term cap', () => {
  it('refuses a laptop at 48 months with 422 QUOTE_REFUSED and term_over_category_max', async () => {
    // Any laptop in the pack: the cap is by category, never by id.
    const { status, body } = await post({
      assetId: 'laptop-004',
      termMonths: 48,
      downPaymentCents: 0,
    });
    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('QUOTE_REFUSED');
    expect(body.error.details).toEqual({
      code: 'term_over_category_max',
      params: { category: 'laptop', termMonths: 48, maxTermMonths: 36 },
    });
    expect(await holder.db.quote.count()).toBe(0);
  });
});

describe('POST /api/quotes prices one unique item (D8)', () => {
  it('refuses a body with a quantity as 400 VALIDATION_ERROR: the body is strict', async () => {
    const { status, body } = await post({
      assetId: 'ebike-004',
      quantity: 4,
      termMonths: 36,
      downPaymentCents: 0,
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(await holder.db.quote.count()).toBe(0);
  });
});
