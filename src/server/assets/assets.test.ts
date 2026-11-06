// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { changeAssetStatus, listAssets, seedAssets, toAsset, toAssetRowData } from './assets';
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
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
});

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

describe('changeAssetStatus', () => {
  it('updates the status and writes an audit row with from and to', async () => {
    await seedAssets(db, dataPack);

    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'reserved',
      actor: 'team-test',
    });

    expect(result).toMatchObject({ ok: true, asset: { id: 'ebike-001', status: 'reserved' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({ action: 'asset.status_changed', entity_id: 'ebike-001' });
    expect(JSON.parse(audit.details_json ?? '')).toEqual({ from: 'available', to: 'reserved' });
  });

  it('answers not_found for an unknown id and writes nothing', async () => {
    const result = await changeAssetStatus(db, { id: 'nope', status: 'reserved', actor: 'x' });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses to change a leased asset, and writes nothing', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'leased' } });

    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'available',
      actor: 'staff-dealer',
    });
    expect(result).toEqual({ ok: false, reason: 'status_locked' });
    const row = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } });
    expect(row.status).toBe('leased');
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses to set leased or sold by hand', async () => {
    await seedAssets(db, dataPack);
    for (const status of ['leased', 'sold'] as const) {
      const result = await changeAssetStatus(db, { id: 'ebike-001', status, actor: 'x' });
      expect(result).toEqual({ ok: false, reason: 'status_locked' });
    }
  });
});

describe('seedAssets on an older database', () => {
  it('fills in missing first-lease data, and never overwrites it', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({
      where: { id: 'ebike-007' },
      data: { first_leased_on: null, first_lease_price_cents: null },
    });
    await db.asset.update({
      where: { id: 'ebike-008' },
      data: { first_leased_on: '2000-01-01' },
    });

    await seedAssets(db, dataPack);
    expect(await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).toMatchObject({
      first_leased_on: '2023-04-11',
      first_lease_price_cents: 549_000,
    });
    const untouched = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    expect(untouched.first_leased_on).toBe('2000-01-01');
  });
});

describe('toAsset', () => {
  it('rejects a row with a value the schema does not allow', () => {
    const [first] = dataPack;
    if (!first) throw new Error('empty data pack');
    const row = {
      ...toAssetRowData(first),
      status: 'stolen',
      relist_price_cents: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(() => toAsset(row)).toThrow();
  });
});
