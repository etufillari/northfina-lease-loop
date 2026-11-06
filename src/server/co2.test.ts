// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { assetOn } from './asset-state';
import { seedAssets } from './assets';
import { fleetImpactOn, itemImpact } from './co2';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  for (const table of ['contract', 'application', 'auditLog', 'asset'] as const) {
    await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await seedAssets(db, await loadAssets());
});

const TODAY = '2026-11-06';

describe('circular impact', () => {
  it('counts the data pack: only items past their second life have a reuse life finished', async () => {
    // ebike-008 and laptop-007 have had 2 lives; nothing is leased yet.
    expect(await fleetImpactOn(db, TODAY)).toMatchObject({ itemsReused: 2, reuseLives: 2 });
  });

  it('card 10: leasing ebike-008 a third time counts its second reuse life', async () => {
    const before = await assetOn(db, 'ebike-008', TODAY);
    if (!before) throw new Error('missing');
    expect(await itemImpact(before, TODAY)).toMatchObject({ reuseLives: 1, reuseSavedKg: 29 });

    await db.asset.update({ where: { id: 'ebike-008' }, data: { status: 'leased' } });
    const leased = await assetOn(db, 'ebike-008', TODAY);
    if (!leased) throw new Error('missing');
    expect(await itemImpact(leased, TODAY)).toMatchObject({
      livesStarted: 3,
      reuseLives: 2,
      reuseSavedKg: 59,
      moneySavedCents: 287_074,
      ridingSavedKg: 1470,
    });
  });
});
