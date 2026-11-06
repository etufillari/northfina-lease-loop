// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import {
  effectivePriceLists,
  listRefurbishments,
  originalListPrice,
  refurbishItem,
  type RefurbishInput,
} from './second-life';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.refurbishment.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const TODAY = '2026-11-06';
// ebike-007 came back in fair condition with 18,400 km (scenario card 9)
const ebike007 = (overrides: Partial<RefurbishInput> = {}): RefurbishInput => ({
  assetId: 'ebike-007',
  conditionFound: 'fair',
  usageFound: 18_400,
  conditionAfter: 'good',
  presetIds: [],
  customRepairs: [],
  priceCents: 172_700,
  notes: 'New battery, brake pads replaced',
  actor: 'Lease Loop staff',
  ...overrides,
});

describe('refurbishItem', () => {
  it('refurbishes ebike-007 to good and puts it back at its second-life price', async () => {
    // fair→good 12000 + battery 35000 + safety check 4500
    expect(await refurbishItem(db, ebike007(), TODAY)).toEqual({
      ok: true,
      status: 'available',
      costCents: 51_500,
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).toMatchObject({
      status: 'available',
      condition: 'good',
      usage_value: 0, // the new battery resets the counter
      second_life_price_cents: 172_700,
    });
    expect(await listRefurbishments(db, 'ebike-007')).toEqual([
      expect.objectContaining({
        conditionBefore: 'fair',
        conditionAfter: 'good',
        usageBefore: 18_400,
        lines: [
          { kind: 'required', id: 'fair->good', label: null, costCents: 12_000 },
          { kind: 'required', id: 'battery_replacement', label: null, costCents: 35_000 },
          { kind: 'required', id: 'safety_inspection', label: null, costCents: 4_500 },
        ],
        notes: 'New battery, brake pads replaced',
      }),
    ]);
    expect(await db.auditLog.count({ where: { action: 'asset.refurbished' } })).toBe(1);

    // From now on every quote uses the second-life price, not the price when new
    const lists = await effectivePriceLists(db, TODAY);
    expect(listPriceOn(lists, 'ebike-007', TODAY)).toMatchObject({ priceCents: 172_700 });
    expect(await originalListPrice('ebike-007')).toBe(549_000);
  });

  it('adds standard and custom repairs, each with its price', async () => {
    const result = await refurbishItem(
      db,
      ebike007({
        presetIds: ['tyres'],
        customRepairs: [{ label: 'New saddle', costCents: 2_500 }],
      }),
      TODAY
    );
    expect(result).toMatchObject({ costCents: 51_500 + 6_000 + 2_500 });
    const [refurbishment] = await listRefurbishments(db, 'ebike-007');
    expect(refurbishment?.lines.slice(-2)).toEqual([
      { kind: 'preset', id: 'tyres', label: null, costCents: 6_000 },
      { kind: 'custom', id: null, label: 'New saddle', costCents: 2_500 },
    ]);
  });

  it('lets the check find a “new” item in a worse condition after its lease', async () => {
    // ebike-001 is new in the data pack; it comes back after a lease, checked as like new
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'returned' } });
    const result = await refurbishItem(
      db,
      ebike007({
        assetId: 'ebike-001',
        conditionFound: 'like_new',
        usageFound: 2_300,
        conditionAfter: 'like_new',
        priceCents: 140_000,
      }),
      TODAY
    );
    expect(result).toEqual({ ok: true, status: 'available', costCents: 4_500 });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).toMatchObject({
      condition: 'like_new',
      usage_value: 2_300,
    });
  });

  it('reserves it for the customer it was passed on to', async () => {
    await db.asset.update({ where: { id: 'ebike-007' }, data: { reserved_for: 'cust-lena' } });
    expect(await refurbishItem(db, ebike007(), TODAY)).toMatchObject({ status: 'reserved' });
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).toMatchObject({
      status: 'reserved',
      reserved_for: 'cust-lena',
    });
  });

  it('keeps it fair only while someone on the waiting list accepts fair', async () => {
    // laptop-007 (fair): wait-08 accepts fair until 12 Nov 2026
    const laptop = { assetId: 'laptop-007', conditionAfter: 'fair' as const, priceCents: 50_000 };
    expect(await refurbishItem(db, ebike007(laptop), '2026-12-01')).toEqual({
      ok: false,
      reason: 'condition_too_low',
    });
    expect(await refurbishItem(db, ebike007(laptop), TODAY)).toMatchObject({ ok: true });
  });

  it('refuses items that aren’t back, downgrades, and impossible prices', async () => {
    expect(await refurbishItem(db, ebike007({ assetId: 'ebike-001' }), TODAY)).toEqual({
      ok: false,
      reason: 'not_returned',
    });
    expect(await refurbishItem(db, ebike007({ conditionAfter: 'poor' }), TODAY)).toEqual({
      ok: false,
      reason: 'cannot_downgrade',
    });
    expect(await refurbishItem(db, ebike007({ priceCents: 0 }), TODAY)).toEqual({
      ok: false,
      reason: 'invalid_price',
    });
    expect(await refurbishItem(db, ebike007({ usageFound: -5 }), TODAY)).toEqual({
      ok: false,
      reason: 'invalid_usage',
    });
    expect(await refurbishItem(db, ebike007({ presetIds: ['screen_glass'] }), TODAY)).toEqual({
      ok: false,
      reason: 'invalid_repairs',
    });
    expect(await db.refurbishment.count()).toBe(0);
  });
});
