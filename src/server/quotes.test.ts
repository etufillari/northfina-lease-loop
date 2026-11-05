// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
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

const input = {
  assetId: 'ebike-003',
  date: '2026-11-05',
  termMonths: 36,
  downPaymentCents: 0,
};

describe('quoteAsset', () => {
  it('prices the asset with the list price on the date and adds display fields', async () => {
    expect(await quoteAsset(db, input)).toMatchObject({
      ok: true,
      quote: {
        asset_id: 'ebike-003',
        quote_date: '2026-11-05',
        price_list_version: 1,
        base_price_cents: 389_000,
        factor: 0.027584,
        monthly_net_rent_cents: 10_730,
        vat_rate_percent: 25.5,
        monthly_vat_cents: 2_736,
        monthly_total_cents: 13_466,
        buyout_percent: 15,
        buyout_cents: 58_350,
        total_if_returned_cents: 386_280,
        total_if_bought_cents: 444_630,
      },
    });
  });

  it('uses the new price list from its first day', async () => {
    expect(await quoteAsset(db, { ...input, date: '2026-11-06' })).toMatchObject({
      ok: true,
      quote: { price_list_version: 2, base_price_cents: 408_400 },
    });
  });

  it('shows the VAT rate on the quote date', async () => {
    expect(await quoteAsset(db, { ...input, date: '2027-01-05' })).toMatchObject({
      ok: true,
      quote: {
        monthly_net_rent_cents: 11_265,
        vat_rate_percent: 26,
        monthly_vat_cents: 2_929,
        monthly_total_cents: 14_194,
      },
    });
  });

  it('counts the down payment in both totals, and the buyout only in the second', async () => {
    expect(await quoteAsset(db, { ...input, downPaymentCents: 50_000 })).toMatchObject({
      ok: true,
      quote: {
        monthly_net_rent_cents: 9_351,
        buyout_cents: 50_850,
        total_if_returned_cents: 386_636,
        total_if_bought_cents: 437_486,
      },
    });
  });

  it('prices several units together, so the band follows the total (card 6)', async () => {
    const one = { ...input, assetId: 'ebike-004', date: '2026-11-06' };
    expect(await quoteAsset(db, one)).toMatchObject({
      ok: true,
      quote: { quantity: 1, base_price_cents: 576_400, band: 'B', monthly_net_rent_cents: 15_899 },
    });
    expect(await quoteAsset(db, { ...one, quantity: 4 })).toMatchObject({
      ok: true,
      quote: {
        quantity: 4,
        unit_price_cents: 576_400,
        base_price_cents: 2_305_600,
        financed_cents: 2_305_600,
        band: 'C',
        monthly_net_rent_cents: 61_938,
        buyout_cents: 345_840,
        down_payment_limits: { min_cents: 0, max_cents: 2_275_600 },
      },
    });
  });

  it('defaults to one unit', async () => {
    expect(await quoteAsset(db, input)).toMatchObject({
      ok: true,
      quote: { quantity: 1, unit_price_cents: 389_000, base_price_cents: 389_000 },
    });
  });

  it('applies the limits to the total: four units can go over the maximum', async () => {
    expect(await quoteAsset(db, { ...input, assetId: 'farm-003', quantity: 1000 })).toMatchObject({
      ok: false,
      reason: 'above_maximum',
    });
  });

  it('refuses a quantity that is not a positive whole number', async () => {
    for (const quantity of [0, -1, 1.5]) {
      await expect(quoteAsset(db, { ...input, quantity })).rejects.toThrow(RangeError);
    }
  });

  it('reports an asset that does not exist', async () => {
    expect(await quoteAsset(db, { ...input, assetId: 'nope' })).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
  });

  it('refuses reserved and returned assets', async () => {
    for (const assetId of ['ebike-009', 'ebike-007']) {
      expect(await quoteAsset(db, { ...input, assetId })).toEqual({
        ok: false,
        reason: 'asset_not_available',
      });
    }
  });

  it('reports a date before the first price list', async () => {
    expect(await quoteAsset(db, { ...input, date: '2025-12-31' })).toEqual({
      ok: false,
      reason: 'no_price_on_date',
    });
  });

  it('passes on the reason a deal cannot be priced, with the down payments that would work', async () => {
    // ebike-010 costs 28 900 on price list 1: under the minimum, so nothing helps.
    expect(await quoteAsset(db, { ...input, assetId: 'ebike-010' })).toEqual({
      ok: false,
      reason: 'below_minimum',
      down_payment_limits: null,
      base_price_cents: 28_900,
      price_list_version: 1,
    });
    expect(await quoteAsset(db, { ...input, assetId: 'farm-006' })).toEqual({
      ok: false,
      reason: 'above_maximum',
      down_payment_limits: { min_cents: 1_000_000, max_cents: 25_970_000 },
      base_price_cents: 26_000_000,
      price_list_version: 1,
    });
  });

  it('returns the down payment limits with a successful quote', async () => {
    expect(await quoteAsset(db, input)).toMatchObject({
      ok: true,
      quote: { down_payment_limits: { min_cents: 0, max_cents: 359_000 } },
    });
    expect(
      await quoteAsset(db, { ...input, assetId: 'ebike-010', date: '2026-11-06' })
    ).toMatchObject({ ok: true, quote: { down_payment_limits: { min_cents: 0, max_cents: 300 } } });
  });

  it('recovers farm-006 once the down payment is inside the limits', async () => {
    expect(
      await quoteAsset(db, { ...input, assetId: 'farm-006', downPaymentCents: 1_000_000 })
    ).toMatchObject({ ok: true, quote: { financed_cents: 25_000_000, band: 'D' } });
  });
});
