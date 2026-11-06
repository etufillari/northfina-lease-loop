// D85: the second-life page is back office. Its read answers the admin with the assessment and
// the waiting list, and anyone else (a customer, anonymous, an unknown actor) with a refusal
// and no data: the waiting list holds other customers' budgets, deadlines and needs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import { readSecondLifePage } from './second-life-page';

let db: PrismaClient;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});

const TODAY = '2026-11-05';

describe('readSecondLifePage (D85)', () => {
  it('the admin gets card 9 (ebike-007): the preview with every waiting-list verdict', async () => {
    const read = await readSecondLifePage(db, 'admin', 'ebike-007', TODAY);
    if (!read.ok) throw new Error(read.reason.code);
    expect(read.asset?.status).toBe('returned');
    expect(read.preview?.ok).toBe(true);
    expect(read.demand.length).toBeGreaterThan(0);
  });

  it.each([
    ['a customer', 'cust-aino', 'admin_only'],
    ['another customer', 'cust-pekka', 'admin_only'],
    ['an unknown actor', 'cust-nobody', 'admin_only'],
    ['anonymous', 'anonymous', 'not_signed_in'],
  ])('%s is refused and gets no waiting-list data', async (_who, actor, code) => {
    const read = await readSecondLifePage(db, actor, 'ebike-007', TODAY);
    expect(read).toEqual({
      ok: false,
      reason: { code, params: { action: 'read_second_life' } },
    });
    expect(JSON.stringify(read)).not.toMatch(/wait-0|max_monthly|Helsinki/);
  });

  it('a customer is refused the same way for an item that does not exist (no existence leak)', async () => {
    const read = await readSecondLifePage(db, 'cust-aino', 'no-such-asset', TODAY);
    expect(read).toMatchObject({ ok: false, reason: { code: 'admin_only' } });
  });

  it('the admin asking for an unknown item gets no asset (the page answers 404)', async () => {
    const read = await readSecondLifePage(db, 'admin', 'no-such-asset', TODAY);
    expect(read).toMatchObject({ ok: true, asset: null });
  });
});
