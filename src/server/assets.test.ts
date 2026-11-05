// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { quoteAndSign } from '../../tests/helpers/quote-and-sign';
import { createTestDb } from '../../tests/helpers/test-db';
import * as assetsModule from './assets';
import { listAssets, seedAssets, toAsset, toAssetRowData } from './assets';
import { loadLeaseDataPack } from './lease-data';
import { loadSecondLifeDataPack, relistAsset } from './second-life';
import type { PrismaClient } from './prisma-client';

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
  await db.quote.deleteMany();
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
});

// Aino's own record (data/customers.json).
const ainoAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

describe('seedAssets', () => {
  it('inserts every asset from the data pack once', async () => {
    expect(await seedAssets(db, dataPack)).toEqual({ created: 30, skipped: 0 });
    expect(await seedAssets(db, dataPack)).toEqual({ created: 0, skipped: 30 });
    expect(await db.asset.count()).toBe(30);
  });

  it('does not overwrite a status you changed', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'reserved' } });
    await seedAssets(db, dataPack);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'reserved'
    );
  });
});

describe('listAssets', () => {
  it('returns assets in the data-pack shape, round-tripping exactly', async () => {
    await seedAssets(db, dataPack);
    const assets = await listAssets(db);
    expect(assets).toEqual([...dataPack].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('filters by category', async () => {
    await seedAssets(db, dataPack);
    const laptops = await listAssets(db, { category: 'laptop' });
    expect(laptops).toHaveLength(10);
    expect(laptops.every((asset) => asset.category === 'laptop')).toBe(true);
  });
});

describe('a leased item stays leased (D-038)', () => {
  // Card: set a reserved item back to available, sign again, and two live contracts exist.
  // The only ways an item becomes available again are re-listing a returned item (D-035).
  it('has no API route that sets an asset status by hand', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/assets/[id]/status'))).toBe(false);
    expect('changeAssetStatus' in assetsModule).toBe(false);
  });

  it('cannot be re-listed while leased, so it cannot be leased a second time', async () => {
    await seedAssets(db, dataPack);
    const [lease, secondLife] = await Promise.all([loadLeaseDataPack(), loadSecondLifeDataPack()]);
    const asAino = {
      assetId: 'ebike-003',
      customerId: 'cust-aino',
      termMonths: 36,
      downPaymentCents: 0,
      answers: ainoAnswers,
      today: '2026-11-05',
      actor: 'cust-aino',
    };
    expect((await quoteAndSign(db, lease, asAino)).ok).toBe(true);

    const relisted = await relistAsset(db, secondLife, {
      assetId: 'ebike-003',
      target: 'good',
      today: '2026-11-05',
      actor: 'back-office',
    });
    expect(relisted).toEqual({ ok: false, reason: 'asset_not_returned' });
    expect(await quoteAndSign(db, lease, { ...asAino, customerId: 'cust-sanna' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count({ where: { asset_id: 'ebike-003' } })).toBe(1);
  });
});

describe('toAsset', () => {
  it('rejects a row with a value the schema does not allow', () => {
    const [first] = dataPack;
    if (!first) throw new Error('empty data pack');
    const row = {
      ...toAssetRowData(first),
      status: 'stolen',
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(() => toAsset(row)).toThrow();
  });
});
