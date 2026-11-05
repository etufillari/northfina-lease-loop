// The Spine as one story: ebike-003 and Aino go round the loop on a test database.
// Each block of the pipeline adds its step here. Figures come from scenario card 1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import { quoteAsset } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
});
afterAll(async () => {
  await cleanup();
});

describe('the lease loop', () => {
  it('takes ebike-003 round the loop', async () => {
    const quoted = await quoteAsset(db, {
      assetId: 'ebike-003',
      date: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
    });

    expect(quoted).toMatchObject({
      ok: true,
      quote: {
        monthly_net_rent_cents: 10_730,
        monthly_vat_cents: 2_736,
        monthly_total_cents: 13_466,
        buyout_cents: 58_350,
      },
    });
  });
});
