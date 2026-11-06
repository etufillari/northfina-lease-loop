// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { forbidden } from '../../tests/helpers/authz';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import {
  changeAssetStatus,
  getAsset,
  listAssets,
  seedAssets,
  toAsset,
  toAssetRowData,
} from './assets';
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
  await resetDb(db);
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

describe('getAsset', () => {
  it('returns one asset in the data-pack shape, or null for an unknown id', async () => {
    await seedAssets(db, dataPack);
    expect(await getAsset(db, 'ebike-009')).toMatchObject({ id: 'ebike-009', status: 'reserved' });
    expect(await getAsset(db, 'no-such-asset')).toBeNull();
  });
});

describe('changeAssetStatus', () => {
  it('updates the status and writes an audit row with from and to', async () => {
    await seedAssets(db, dataPack);

    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'reserved',
      actor: 'admin',
    });

    expect(result).toMatchObject({ ok: true, asset: { id: 'ebike-001', status: 'reserved' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({ action: 'asset.status_changed', entity_id: 'ebike-001' });
    expect(JSON.parse(audit.details_json ?? '')).toEqual({ from: 'available', to: 'reserved' });
  });

  it('refuses leased by hand and writes nothing: only signing leases an item (product review 4)', async () => {
    await seedAssets(db, dataPack);
    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'leased',
      actor: 'admin',
    });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'transition_by_event_only', params: { from: 'available', to: 'leased' } },
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'available'
    );
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses returned by hand on a leased item, so an active contract keeps its asset (product review 4)', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'leased' } });
    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'returned',
      actor: 'admin',
    });
    expect(result).toMatchObject({ ok: false, reason: { code: 'transition_by_event_only' } });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'leased'
    );
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses anyone but admin and writes nothing (wave 1 finding 5)', async () => {
    await seedAssets(db, dataPack);
    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'reserved',
      actor: 'cust-aino',
    });
    expect(result).toEqual(forbidden('admin_only', 'set_asset_status'));
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'available'
    );
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses a change outside D22 with a code and both statuses, and writes nothing', async () => {
    await seedAssets(db, dataPack);
    // ebike-009 is reserved in the data pack: a held item cannot be leased past the hold.
    const result = await changeAssetStatus(db, {
      id: 'ebike-009',
      status: 'leased',
      actor: 'admin',
    });
    expect(result).toEqual({
      ok: false,
      reason: { code: 'transition_not_allowed', params: { from: 'reserved', to: 'leased' } },
    });
    expect(await db.auditLog.count()).toBe(0);
  });

  it('refuses a status outside the list itself, whoever calls it, and writes nothing', async () => {
    await seedAssets(db, dataPack);
    // A caller that skips the route's body check (a handler, a script) cannot slip a bad value in.
    const input = { id: 'ebike-001', status: 'stolen' as never, actor: 'admin' };

    await expect(changeAssetStatus(db, input)).rejects.toThrow();
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'available'
    );
    expect(await db.auditLog.count()).toBe(0);
  });

  it('answers not_found for an unknown id and writes nothing', async () => {
    const result = await changeAssetStatus(db, { id: 'nope', status: 'reserved', actor: 'admin' });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(await db.auditLog.count()).toBe(0);
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
