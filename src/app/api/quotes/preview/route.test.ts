// GET /api/quotes/preview answers a term over the category's cap (D43) as a refusal inside the
// `ok()` envelope, like every other pricing refusal, with the comparison of the allowed terms.
// The data pack is read from disk; the demo clock cookie is empty, so today is the real day.
// The route reads the second-life price (D12) from the database, so the app's `db` module is
// pointed at a real, migrated SQLite database, as in ../route.test.ts; nothing else is replaced.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/test-db';
import type { PrismaClient } from '@/server/prisma-client';

const holder = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock('@/server/db', () => ({
  get db() {
    return holder.db;
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { GET } = await import('./route');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db: holder.db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});

async function preview(query: Record<string, string>) {
  const url = new URL('http://localhost/api/quotes/preview');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await GET(new Request(url), { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json() };
}

// Any laptop in the pack: the cap is by category, never by id.
const laptop = 'laptop-004';

describe('GET /api/quotes/preview and the term cap', () => {
  it('answers a laptop at 48 months with term_over_category_max in the ok envelope', async () => {
    const { status, body } = await preview({ assetId: laptop, termMonths: '48' });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.quote).toBeNull();
    expect(body.data.refusal).toEqual({
      code: 'term_over_category_max',
      params: { category: 'laptop', termMonths: 48, maxTermMonths: 36 },
    });
  });

  it('compares only the allowed terms, so 48 is neither a row nor an unavailable term', async () => {
    const { body } = await preview({ assetId: laptop, termMonths: '48' });
    const rows = body.data.comparison.rows.map((row: { termMonths: number }) => row.termMonths);
    expect(rows).toEqual([12, 24, 36]);
    expect(body.data.comparison.unavailable).toEqual([]);
  });

  it('prices the same laptop at 36 months', async () => {
    const { body } = await preview({ assetId: laptop, termMonths: '36' });
    expect(body.data.refusal).toBeNull();
    expect(body.data.quote).toMatchObject({ assetId: laptop, termMonths: 36 });
  });
});
