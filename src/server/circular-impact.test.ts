import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { getAssetCircularImpact, getFleetCircularImpact } from './circular-impact';
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
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

describe('getAssetCircularImpact', () => {
  it('returns an explainable impact snapshot for one asset', async () => {
    const result = await getAssetCircularImpact(db, 'ebike-008', { asOf: '2026-11-06' });

    expect(result).toMatchObject({
      ok: true,
      asset: { id: 'ebike-008' },
      impact: { assetId: 'ebike-008', reuseLives: 2, co2: { savedGrams: 290_400 } },
    });
  });

  it('returns a value failure for an unknown asset', async () => {
    await expect(getAssetCircularImpact(db, 'missing', { asOf: '2026-11-06' })).resolves.toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
  });
});

describe('getFleetCircularImpact', () => {
  it('returns all seeded assets and exact fleet totals', async () => {
    const result = await getFleetCircularImpact(db, { asOf: '2026-11-06' });

    expect(result.ok).toBe(true);
    expect(result.impact.items).toHaveLength(30);
    expect(result.impact.excluded).toEqual([]);
    expect(result.impact.totals.reuseLives).toBe(
      result.impact.items.reduce((total, item) => total + item.reuseLives, 0)
    );
  });
});
