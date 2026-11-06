// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ainoEbikeAnswers } from '../../../tests/helpers/applicants';
import { applyFor, findCustomer, resetLeaseData, signFor } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import { listAssets } from '../assets/assets';
import { endContract } from '../end-of-term/contract-end';
import type { PrismaClient } from '../prisma-client';
import { quoteAsset } from '../pricing/quotes';
import { previewRelist, relistAsset } from './relist';

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

const relist = (assetId: string, condition: 'good' | 'fair', usageValue: number) =>
  relistAsset(db, { assetId, condition, usageValue, actor: 'staff-dealer' });

const assetRow = (id: string) => db.asset.findUniqueOrThrow({ where: { id } });

describe('previewRelist', () => {
  it('values a seeded item from its made-up first lease, and changes nothing', async () => {
    const result = await previewRelist(db, {
      assetId: 'ebike-008',
      condition: 'good',
      usageValue: 9_800,
    });
    expect(result).toEqual({
      ok: true,
      preview: {
        asset_id: 'ebike-008',
        condition: 'good',
        usage_value: 9_800,
        first_leased_on: '2022-03-07',
        first_lease_price_cents: 179_900,
        age_months: 55,
        market_value_cents: 34_482,
        curve_basis_points: 2_750,
        condition_basis_points: 8_500,
        usage_basis_points: 8_200,
      },
    });
    expect((await assetRow('ebike-008')).status).toBe('returned');
  });

  it.each([
    ['fair', 101_345],
    ['poor', 62_366],
  ] as const)(
    'refuses a %s item (ebike-007), and says what it is worth',
    async (condition, value) => {
      const result = await previewRelist(db, {
        assetId: 'ebike-007',
        condition,
        usageValue: 18_400,
      });
      expect(result).toEqual({
        ok: false,
        reason: 'condition_too_low',
        market_value_cents: value,
      });
    }
  );

  it('accepts the same item once it has reached good', async () => {
    const result = await previewRelist(db, {
      assetId: 'ebike-007',
      condition: 'good',
      usageValue: 18_400,
    });
    expect(result).toMatchObject({ ok: true, preview: { market_value_cents: 132_529 } });
  });

  it('refuses a price under the minimum, with the value', async () => {
    await db.asset.update({
      where: { id: 'ebike-008' },
      data: { first_lease_price_cents: 40_000 },
    });
    const result = await previewRelist(db, {
      assetId: 'ebike-008',
      condition: 'good',
      usageValue: 20_000,
    });
    expect(result).toMatchObject({ ok: false, reason: 'below_minimum' });
  });

  it('refuses an item that is not back with the dealer', async () => {
    const input = { assetId: 'ebike-003', condition: 'good' as const, usageValue: 0 };
    expect(await previewRelist(db, input)).toEqual({ ok: false, reason: 'asset_not_returned' });
  });

  it('reports an unknown asset', async () => {
    const input = { assetId: 'nope', condition: 'good' as const, usageValue: 0 };
    expect(await previewRelist(db, input)).toEqual({ ok: false, reason: 'asset_not_found' });
  });

  it('refuses an item with no known first lease', async () => {
    await db.asset.update({
      where: { id: 'ebike-008' },
      data: { first_leased_on: null, first_lease_price_cents: null },
    });
    const input = { assetId: 'ebike-008', condition: 'good' as const, usageValue: 0 };
    expect(await previewRelist(db, input)).toEqual({
      ok: false,
      reason: 'unknown_first_lease',
    });
  });
});

describe('relistAsset', () => {
  it('sets the price, records what was found and makes the item available', async () => {
    const result = await relist('ebike-008', 'good', 9_800);
    expect(result).toMatchObject({
      ok: true,
      asset: {
        status: 'available',
        condition: 'good',
        usage: { value: 9_800 },
        relist_price_cents: 34_482,
        previous_lives: 2,
      },
    });
  });

  it('writes one audit row', async () => {
    await db.auditLog.deleteMany();
    await relist('ebike-008', 'good', 9_800);

    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'staff-dealer',
      action: 'asset.relisted',
      entity_id: 'ebike-008',
    });
    expect(JSON.parse(rows[0]?.details_json ?? '')).toMatchObject({
      condition: 'good',
      relist_price_cents: 34_482,
    });
  });

  it('changes nothing when refused', async () => {
    await db.auditLog.deleteMany();
    const result = await relist('ebike-007', 'fair', 18_400);
    expect(result.ok).toBe(false);

    expect(await assetRow('ebike-007')).toMatchObject({
      status: 'returned',
      condition: 'fair',
      relist_price_cents: null,
    });
    expect(await db.auditLog.count()).toBe(0);
  });

  it('can only be done once', async () => {
    await relist('ebike-008', 'good', 9_800);
    expect(await relist('ebike-008', 'good', 9_800)).toEqual({
      ok: false,
      reason: 'asset_not_returned',
    });
  });
});

describe('the second life of an item the app leased', () => {
  async function leaseAndReturn() {
    const application = await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
    const contract = await signFor(db, 'cust-aino', application.id);
    await db.appSetting.update({ where: { key: 'demo_date' }, data: { value: '2029-11-04' } });
    await endContract(db, {
      contractId: contract.id,
      customer: await findCustomer('cust-aino'),
      outcome: 'returned',
    });
    return contract;
  }

  it('values it from its first lease and completes the closed life', async () => {
    const contract = await leaseAndReturn();

    expect(await relist('ebike-003', 'good', 8_000)).toMatchObject({
      ok: true,
      asset: { status: 'available', previous_lives: 1 },
      preview: { age_months: 35, first_lease_price_cents: 389_000 },
    });
    expect(
      await db.assetLife.findUniqueOrThrow({ where: { contract_id: contract.id } })
    ).toMatchObject({
      outcome: 'returned',
      end_condition: 'good',
      end_usage_value: 8_000,
    });
  });

  it('quotes the next customer at the re-list price, with no price list', async () => {
    await leaseAndReturn();
    const relisted = await relist('ebike-003', 'good', 8_000);
    if (!relisted.ok) throw new Error(relisted.reason);

    const quoted = await quoteAsset(db, {
      assetId: 'ebike-003',
      date: '2029-11-04',
      termMonths: 24,
      downPaymentCents: 0,
    });
    expect(quoted).toMatchObject({
      ok: true,
      quote: {
        price_list_version: null,
        base_price_cents: relisted.asset.relist_price_cents,
      },
    });
  });

  it('leases it to the next customer as life 2, keeping the first-lease price', async () => {
    await leaseAndReturn();
    const relisted = await relist('ebike-003', 'good', 8_000);
    if (!relisted.ok) throw new Error(relisted.reason);

    const answers = { ...ainoEbikeAnswers, q_country: 'EE', q_monthly_income: 210_000 };
    const application = await applyFor(db, 'cust-lena', 'ebike-003', answers, { termMonths: 24 });
    expect(application).toMatchObject({ decision: 'approved', price_list_version: null });
    const second = await signFor(db, 'cust-lena', application.id);

    expect(second).toMatchObject({
      price_list_version: null,
      base_price_cents: relisted.asset.relist_price_cents,
      list_price_on_signing_cents: null,
    });
    expect(
      await db.assetLife.findFirstOrThrow({ where: { contract_id: second.id } })
    ).toMatchObject({
      life_number: 2,
      first_lease_price_cents: 389_000,
      start_condition: 'good',
      start_usage_value: 8_000,
    });
  });
});

describe('a re-listed item in the catalogue', () => {
  it('carries its re-list price', async () => {
    await relist('ebike-008', 'good', 9_800);
    const assets = await listAssets(db, { category: 'e_bike' });
    expect(assets.find((asset) => asset.id === 'ebike-008')).toMatchObject({
      status: 'available',
      relist_price_cents: 34_482,
    });
    expect(assets.find((asset) => asset.id === 'ebike-001')).not.toHaveProperty(
      'relist_price_cents'
    );
  });
});
