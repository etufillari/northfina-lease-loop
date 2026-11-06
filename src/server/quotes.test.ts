// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { quoteStatusOn, type PricingData } from '@/domain/pricing';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { seedAssets } from './assets';
import {
  createQuote,
  getQuote,
  loadPricingData,
  previewQuote,
  storedQuoteStatusOn,
} from './quotes';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: PricingData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadPricingData();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedAssets(db, await loadAssets());
});

const card1 = {
  assetId: 'ebike-003',
  termMonths: 36,
  downPaymentCents: 0,
  today: '2026-11-05',
  actor: 'cust-01',
};

describe('createQuote (D7)', () => {
  it('stores card 1 with its date, 14-day validity, list version and frozen numbers', async () => {
    const result = await createQuote(db, card1, data);
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.quote).toMatchObject({ quoteDate: '2026-11-05', validUntil: '2026-11-19' });

    const row = await db.quote.findUniqueOrThrow({ where: { id: result.quote.id } });
    expect(row).toMatchObject({
      asset_id: 'ebike-003',
      quantity: 1,
      quote_date: '2026-11-05',
      valid_until: '2026-11-19',
      price_list_version: 1,
      list_price_cents: 389_000,
      down_payment_cents: 0,
      financed_cents: 389_000,
      band: 'B',
      factor_millionths: 27_584,
      term_months: 36,
      monthly_net_cents: 10_730,
      buyout_cents: 58_350,
      vat_rate_bp_at_quote: 2550,
    });
  });

  it('writes quote.created to the audit log in the same change', async () => {
    const result = await createQuote(db, card1, data);
    if (!result.ok) throw new Error(result.reason.code);
    const audit = await db.auditLog.findFirstOrThrow({ where: { entity_id: result.quote.id } });
    expect(audit).toMatchObject({
      actor: 'cust-01',
      action: 'quote.created',
      entity_type: 'quote',
    });
  });

  it('stores card 6 as one quote for one bike at the band B rent (D8: one unique item)', async () => {
    const result = await createQuote(db, { ...card1, assetId: 'ebike-004' }, data);
    expect(result).toMatchObject({
      ok: true,
      quote: {
        breakdown: { quantity: 1, financedCents: 549_000, band: 'B', monthlyNetCents: 15_144 },
      },
    });
    if (!result.ok) return;
    const row = await db.quote.findUniqueOrThrow({ where: { id: result.quote.id } });
    expect(row.quantity).toBe(1);
  });

  it('refuses a price refusal without writing anything', async () => {
    const result = await createQuote(db, { ...card1, assetId: 'ebike-010' }, data);
    expect(result).toMatchObject({ ok: false, reason: { code: 'below_minimum' } });
    expect(await db.quote.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses a reserved asset (ebike-009) with its status', async () => {
    const result = await createQuote(db, { ...card1, assetId: 'ebike-009' }, data);
    expect(result).toEqual({
      ok: false,
      reason: { code: 'asset_not_available', params: { assetId: 'ebike-009', status: 'reserved' } },
    });
    expect(await db.quote.count()).toBe(0);
  });

  it('refuses an asset priced in the data pack but missing from the database', async () => {
    await db.asset.delete({ where: { id: 'laptop-004' } });
    const result = await createQuote(db, { ...card1, assetId: 'laptop-004' }, data);
    expect(result).toMatchObject({ ok: false, reason: { code: 'unknown_asset' } });
  });

  it('loads the data pack itself when no pricing data is passed', async () => {
    expect(await createQuote(db, card1)).toMatchObject({ ok: true });
  });
});

describe('getQuote, card 2 (the price stays locked after the list changes)', () => {
  it('returns the v1 price on 2026-11-06 and the status offers the cheaper v2', async () => {
    const created = await createQuote(db, { ...card1, assetId: 'laptop-004' }, data);
    if (!created.ok) throw new Error(created.reason.code);

    const stored = await getQuote(db, created.quote.id);
    expect(stored?.breakdown).toMatchObject({
      priceListVersion: 1,
      unitListPriceCents: 349_000,
      monthlyNetCents: 9627,
    });
    expect(stored?.breakdown).toEqual(created.quote.breakdown);

    const status = quoteStatusOn(
      {
        assetId: stored!.breakdown.assetId,
        quoteDate: stored!.quoteDate,
        validUntil: stored!.validUntil,
        priceListVersion: stored!.breakdown.priceListVersion,
        unitListPriceCents: stored!.breakdown.unitListPriceCents,
      },
      '2026-11-06',
      data.priceLists
    );
    expect(status).toMatchObject({
      status: 'valid',
      lockedListVersion: 1,
      todayList: { version: 2, unitPriceCents: 321_100 },
      cheaperListLive: true,
    });
  });

  it('returns null for an unknown id', async () => {
    expect(await getQuote(db, 'no-such-quote')).toBeNull();
  });

  it('reads on a transaction client too, so another slice calls it inside its own change', async () => {
    const created = await createQuote(db, card1, data);
    if (!created.ok) throw new Error(created.reason.code);
    const read = await db.$transaction((tx) => getQuote(tx, created.quote.id));
    expect(read).toEqual(created.quote);
  });
});

describe('storedQuoteStatusOn', () => {
  it('reads card 2 from the stored quote: locked at v1, v2 cheaper the next day', async () => {
    const created = await createQuote(db, { ...card1, assetId: 'laptop-004' }, data);
    if (!created.ok) throw new Error(created.reason.code);
    expect(storedQuoteStatusOn(created.quote, '2026-11-06', data.priceLists)).toMatchObject({
      lockedListVersion: 1,
      cheaperListLive: true,
    });
    expect(storedQuoteStatusOn(created.quote, '2026-11-20', data.priceLists).status).toBe(
      'expired'
    );
  });
});

describe('previewQuote (the sliders, no write)', () => {
  it('prices card 1 on today and compares the four terms without storing anything', async () => {
    const preview = previewQuote(data, {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      today: '2026-11-05',
    });
    expect(preview.quote?.monthlyGrossCents).toBe(13_466);
    expect(preview.refusal).toBeNull();
    expect(preview.comparison.rows).toHaveLength(4);
    expect(await db.quote.count()).toBe(0);
  });

  it('returns the refusal and no quote for ebike-010', () => {
    const preview = previewQuote(data, {
      assetId: 'ebike-010',
      termMonths: 36,
      downPaymentCents: 0,
      today: '2026-11-05',
    });
    expect(preview.quote).toBeNull();
    expect(preview.refusal?.code).toBe('below_minimum');
  });
});
