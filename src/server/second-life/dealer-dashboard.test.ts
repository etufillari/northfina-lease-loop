// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetLeaseData } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import type { PrismaClient } from '../prisma-client';
import { dealerDashboard } from './dealer-dashboard';
import { relistAsset, releaseAsset } from './relist';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
});

const hold = (assetId: string, customerId: string) =>
  db.asset.update({ where: { id: assetId }, data: { reserved_for: customerId } });

describe('dealerDashboard', () => {
  it('lists every returned item in the data pack', async () => {
    const { returned } = await dealerDashboard(db);

    expect(returned.map((asset) => asset.id).sort()).toEqual([
      'ebike-007',
      'ebike-008',
      'ebike-011',
      'farm-005',
      'laptop-006',
      'laptop-007',
    ]);
  });

  it('holds nothing to begin with', async () => {
    expect((await dealerDashboard(db)).held).toEqual([]);
  });

  it('says who an item is held for', async () => {
    await hold('ebike-012', 'cust-wait-02');
    const { held } = await dealerDashboard(db);

    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ id: 'ebike-012', held_for_name: 'Jonas Lind' });
  });

  it('falls back to the id for someone it cannot find', async () => {
    await hold('ebike-012', 'cust-gone');
    expect((await dealerDashboard(db)).held[0]?.held_for_name).toBe('cust-gone');
  });

  it('drops an item once it is re-listed', async () => {
    await relistAsset(db, {
      assetId: 'ebike-008',
      condition: 'good',
      usageValue: 9_800,
      actor: 'staff-dealer',
    });

    const ids = (await dealerDashboard(db)).returned.map((asset) => asset.id);
    expect(ids).not.toContain('ebike-008');
  });

  it('drops an item once it is released', async () => {
    await hold('ebike-012', 'cust-wait-02');
    await releaseAsset(db, { assetId: 'ebike-012', actor: 'staff-dealer' });

    expect((await dealerDashboard(db)).held).toEqual([]);
  });
});
