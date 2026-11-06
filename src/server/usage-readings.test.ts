// The meter reading at a return, against a real (test) database: the lifetime total and the
// count since the last reset both grow by what the lease used; a low or missing reading is
// refused before anything is written.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { applyReadings, checkReadings, readingDetails } from './usage-readings';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
});
afterAll(async () => {
  await cleanup();
});

describe('meter readings at a return', () => {
  it('needs a reading for every item', async () => {
    expect(await checkReadings(db, ['ebike-005', 'farm-004'], { 'ebike-005': 1300 })).toEqual({
      ok: false,
      reason: 'usage_reading_missing',
    });
  });

  it('refuses a reading below the lifetime total', async () => {
    // ebike-005 has done 1,200 km.
    expect(await checkReadings(db, ['ebike-005'], { 'ebike-005': 1199 })).toEqual({
      ok: false,
      reason: 'usage_reading_below_total',
    });
  });

  it('adds what the lease used to both counters', async () => {
    // farm-005: 4,200 h in total, 200 since its last service (serviced on schedule).
    const checked = await checkReadings(db, ['ebike-005', 'farm-005'], {
      'ebike-005': 3700,
      'farm-005': 4650,
    });
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.updates).toEqual([
      {
        assetId: 'ebike-005',
        reading: 3700,
        added: 2500,
        total: 3700,
        sinceReset: 3700,
        conditionOut: 'like_new',
      },
      {
        assetId: 'farm-005',
        reading: 4650,
        added: 450,
        total: 4650,
        sinceReset: 650,
        conditionOut: 'good',
      },
    ]);
    await db.$transaction((tx) => applyReadings(tx, checked.updates));
    const farm = await db.asset.findUniqueOrThrow({ where: { id: 'farm-005' } });
    expect(farm).toMatchObject({ usage_total: 4650, usage_value: 650 });
    expect(readingDetails(checked.updates, 'farm-005')).toEqual({
      usageReading: 4650,
      usageAdded: 450,
      conditionOut: 'good',
    });
    expect(readingDetails(checked.updates, 'nope')).toEqual({});
  });
});
