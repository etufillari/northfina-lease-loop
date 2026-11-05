// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import type { LeaseDataPack } from './lease-data';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';
import { createQuote, getQuote, viewQuote } from './quotes';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseDataPack;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadLeaseDataPack();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.quote.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

// Card 2: laptop-004, 36 months, nothing down, quoted on Thu 5 Nov 2026.
const card2 = {
  assetId: 'laptop-004',
  termMonths: 36,
  downPaymentCents: 0,
  today: '2026-11-05',
  actor: 'customer',
};

describe('createQuote', () => {
  it('prices on the server and stores every amount it shows (card 2, Thu on v1)', async () => {
    const result = await createQuote(db, data, card2);
    // 349 000 × 0.027584 (36 m, band B) = 9 626.8 → 9 627; buyout 15 % = 52 350.
    const expected = {
      assetId: 'laptop-004',
      quoteDate: '2026-11-05',
      validUntil: '2026-11-12', // 5 Nov + 7 days, the last day it can be signed
      termMonths: 36,
      downPaymentCents: 0,
      priceListVersion: 1,
      coefficientTableId: 'ct-2026-1',
      listPriceCents: 349_000,
      financedCents: 349_000,
      band: 'B',
      factor: 0.027584,
      monthlyNetRentCents: 9_627,
      buyoutCents: 52_350,
      totalNetRentCents: 346_572, // 36 × 9 627
      totalNetCostCents: 346_572, // + 0 down
    };
    expect(result).toEqual({ ok: true, id: expect.any(Number), quote: expected });
    if (!result.ok) return;

    expect(await getQuote(db, result.id)).toEqual({
      id: result.id,
      quote: expected,
      contractId: null,
      replacesQuoteId: null,
    });
    const row = await db.quote.findUniqueOrThrow({ where: { id: result.id } });
    expect(row).toMatchObject({
      asset_id: 'laptop-004',
      quote_date: '2026-11-05',
      valid_until: '2026-11-12',
      price_list_version: 1,
      term_months: 36,
      down_payment_cents: 0,
      monthly_net_rent_cents: 9_627,
    });
  });

  it('writes one audit row naming the quote, with the effective date', async () => {
    const result = await createQuote(db, data, card2);
    if (!result.ok) throw new Error(result.reason);
    const log = await listAuditLog(db);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actor: 'customer',
      action: 'quote.created',
      entity_type: 'quote',
      entity_id: String(result.id),
      details: {
        assetId: 'laptop-004',
        monthlyNetRentCents: 9_627,
        priceListVersion: 1,
        validUntil: '2026-11-12',
        asOf: '2026-11-05',
      },
    });
  });

  it('prices from the list valid on the day: Fri 6 Nov is v2', async () => {
    // 321 100 × 0.027584 = 8 857.2 → 8 857.
    expect(await createQuote(db, data, { ...card2, today: '2026-11-06' })).toMatchObject({
      ok: true,
      quote: { priceListVersion: 2, listPriceCents: 321_100, monthlyNetRentCents: 8_857 },
    });
  });

  it('refuses unknown and unavailable items, and writes nothing', async () => {
    expect(await createQuote(db, data, { ...card2, assetId: 'nope' })).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    // ebike-009 is reserved in the data pack; laptop-006 has been returned.
    for (const assetId of ['ebike-009', 'laptop-006']) {
      expect(await createQuote(db, data, { ...card2, assetId })).toEqual({
        ok: false,
        reason: 'asset_not_available',
      });
    }
    expect(await db.quote.count()).toBe(0);
    expect(await listAuditLog(db)).toHaveLength(0);
  });

  it('passes on pricing refusals, such as a down payment off the slider step', async () => {
    expect(await createQuote(db, data, { ...card2, downPaymentCents: 1 })).toEqual({
      ok: false,
      reason: 'down_payment_off_step',
    });
    expect(await db.quote.count()).toBe(0);
  });
});

describe('viewQuote', () => {
  it('shows the cheaper price on Fri for a quote made on Thu (card 2)', async () => {
    const created = await createQuote(db, data, card2);
    if (!created.ok) throw new Error(created.reason);
    expect(await viewQuote(db, data, created.id, '2026-11-06')).toMatchObject({
      id: created.id,
      status: 'open',
      quote: { monthlyNetRentCents: 9_627 },
      priceCheck: {
        kind: 'cheaper_today',
        savingPerMonthCents: 770, // 9 627 − 8 857
        requote: { priceListVersion: 2, monthlyNetRentCents: 8_857 },
      },
    });
  });

  it('is open on day 7 and expired on day 8, with no price check once expired', async () => {
    const created = await createQuote(db, data, card2);
    if (!created.ok) throw new Error(created.reason);
    expect(await viewQuote(db, data, created.id, '2026-11-12')).toMatchObject({ status: 'open' });
    expect(await viewQuote(db, data, created.id, '2026-11-13')).toMatchObject({
      status: 'expired',
      priceCheck: null,
    });
  });

  it('returns null for an id that does not exist', async () => {
    expect(await viewQuote(db, data, 999_999, '2026-11-05')).toBeNull();
    expect(await getQuote(db, 999_999)).toBeNull();
  });
});
