import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { createLeaseOffer } from './lease-offer';
import type { PrismaClient } from '../prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.asset.deleteMany();
  await seedAssets(db, dataPack);
});

describe('createLeaseOffer', () => {
  it('bases the limits and the quote of a used item on its market value', async () => {
    await expect(createLeaseOffer(db, 'ebike-005', '2026-11-06')).resolves.toMatchObject({
      ok: true,
      limits: { minDownPaymentCents: 0, maxDownPaymentCents: 51_416 },
      quote: {
        pricing: { netListPriceCents: 81_416 },
        sources: { priceBasis: 'market_value' },
      },
    });
  });

  it('returns the limits and the quote for the default choice', async () => {
    await expect(createLeaseOffer(db, 'ebike-003', '2026-11-05')).resolves.toMatchObject({
      ok: true,
      limits: { termOptions: [12, 24, 36, 48], minDownPaymentCents: 0 },
      quote: { pricing: { termMonths: 36, downPaymentCents: 0, monthlyNetRentCents: 10_730 } },
    });
  });

  it('starts an item above the top band on its required down payment', async () => {
    await db.asset.update({ where: { id: 'farm-006' }, data: { status: 'available' } });

    await expect(createLeaseOffer(db, 'farm-006', '2026-11-06')).resolves.toMatchObject({
      ok: true,
      limits: { minDownPaymentCents: 1_000_000 },
      quote: { pricing: { downPaymentCents: 1_000_000, financedCents: 25_000_000 } },
    });
  });

  it('rejects an item below the lowest band', async () => {
    await expect(createLeaseOffer(db, 'ebike-010', '2026-11-05')).resolves.toEqual({
      ok: false,
      reason: 'below_minimum',
    });
  });

  it('offers that same item once its price reaches the lowest band', async () => {
    await expect(createLeaseOffer(db, 'ebike-010', '2026-11-06')).resolves.toMatchObject({
      ok: true,
      limits: { minDownPaymentCents: 0, maxDownPaymentCents: 0 },
    });
  });

  it('reports an item that cannot be leased right now', async () => {
    await expect(createLeaseOffer(db, 'ebike-009', '2026-11-06')).resolves.toEqual({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    });
  });

  it('reports an asset with no price', async () => {
    await expect(createLeaseOffer(db, 'missing', '2026-11-06')).resolves.toEqual({
      ok: false,
      reason: 'unknown_asset',
    });
  });

  it('reports a date before the first price list', async () => {
    await expect(createLeaseOffer(db, 'ebike-003', '2025-12-31')).resolves.toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });
});
