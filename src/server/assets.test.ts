// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  changeAssetStatus,
  listAssets,
  relistAsset,
  resolveAssetEndOfTerm,
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
  await db.assetEvent.deleteMany();
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
});

describe('resolveAssetEndOfTerm', () => {
  it('handles buyout: sets status to sold and logs asset.bought_out', async () => {
    await seedAssets(db, dataPack);

    const result = await resolveAssetEndOfTerm(db, {
      id: 'ebike-001',
      action: 'buyout',
      actor: 'customer-aino',
      details: { buyoutGrossCents: 73229 },
    });

    expect(result).toMatchObject({ ok: true, asset: { id: 'ebike-001', status: 'sold' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({
      action: 'asset.bought_out',
      actor: 'customer-aino',
      entity_id: 'ebike-001',
    });
    expect(JSON.parse(audit.details_json ?? '')).toMatchObject({
      from: 'available',
      to: 'sold',
      action: 'buyout',
      buyoutGrossCents: 73229,
    });
  });

  it('handles return: sets status to returned and logs asset.returned', async () => {
    await seedAssets(db, dataPack);

    const result = await resolveAssetEndOfTerm(db, {
      id: 'laptop-001',
      action: 'return',
      actor: 'customer-mikko',
    });

    expect(result).toMatchObject({ ok: true, asset: { id: 'laptop-001', status: 'returned' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({ action: 'asset.returned', entity_id: 'laptop-001' });
  });

  it('handles pass_on: sets status to returned and logs asset.passed_on', async () => {
    await seedAssets(db, dataPack);

    const result = await resolveAssetEndOfTerm(db, {
      id: 'ebike-002',
      action: 'pass_on',
      actor: 'customer-norvi',
      details: { matchedWaitlistId: 'wait-02', avoidedCo2Kg: 24.5 },
    });

    expect(result).toMatchObject({ ok: true, asset: { id: 'ebike-002', status: 'returned' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({
      action: 'asset.passed_on',
      entity_id: 'ebike-002',
    });
    expect(JSON.parse(audit.details_json ?? '')).toMatchObject({
      matchedWaitlistId: 'wait-02',
      avoidedCo2Kg: 24.5,
    });
  });

  it('keeps the real transition in the audit details when the caller sends colliding keys', async () => {
    await seedAssets(db, dataPack);

    await resolveAssetEndOfTerm(db, {
      id: 'laptop-002',
      action: 'return',
      actor: 'customer-aino',
      details: { from: 'forged', to: 'forged', action: 'forged', note: 'kept' },
    });

    const audit = await db.auditLog.findFirstOrThrow();
    expect(JSON.parse(audit.details_json ?? '')).toEqual({
      from: 'available',
      to: 'returned',
      action: 'return',
      note: 'kept',
    });
  });

  it('answers not_found for an unknown id', async () => {
    const result = await resolveAssetEndOfTerm(db, {
      id: 'nope',
      action: 'buyout',
      actor: 'test',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
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
      relist_price_cents: null,
      first_lease_date: null,
      first_list_price_cents: null,
    };
    expect(() => toAsset(row)).toThrow();
  });
});

describe('relistAsset', () => {
  it('relists ebike-007 (Card 9) at 92781 cents, sets status to available, and writes AssetEvent + AuditLog', async () => {
    await seedAssets(db, dataPack);

    const result = await relistAsset(db, {
      id: 'ebike-007',
      actor: 'dealer-demo',
      asOf: '2026-11-05',
    });

    expect(result).toMatchObject({
      ok: true,
      asset: {
        id: 'ebike-007',
        status: 'available',
        relist_price_cents: 92_781,
        first_lease_date: '2023-01-01',
        first_list_price_cents: 549_000,
      },
    });

    const event = await db.assetEvent.findFirstOrThrow({ where: { asset_id: 'ebike-007' } });
    expect(event).toMatchObject({
      from_status: 'returned',
      to_status: 'available',
      amount_cents: 92_781,
      note_key: 'passport.event.relisted',
    });

    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({
      action: 'asset.relisted',
      entity_id: 'ebike-007',
      actor: 'dealer-demo',
    });
  });

  it('recomputes a fresh relist_price_cents when an asset is returned after a prior relisted life', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({
      where: { id: 'ebike-007' },
      data: { relist_price_cents: 200_000, status: 'returned' },
    });

    const result = await relistAsset(db, {
      id: 'ebike-007',
      actor: 'dealer-demo',
      asOf: '2026-11-05',
    });

    expect(result).toMatchObject({
      ok: true,
      asset: { id: 'ebike-007', status: 'available', relist_price_cents: 92_781 },
    });
  });

  it('rejects laptop-006 with below_minimum because its residual value is 27577 (< 30000)', async () => {
    await seedAssets(db, dataPack);

    const result = await relistAsset(db, {
      id: 'laptop-006',
      actor: 'dealer-demo',
      asOf: '2026-11-05',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'below_minimum',
      relistPriceCents: 27_577,
    });
    expect(await db.auditLog.count()).toBe(0);
  });

  it('rejects an asset that is not returned or does not exist', async () => {
    await seedAssets(db, dataPack);

    expect(await relistAsset(db, { id: 'ebike-001', actor: 'dealer-demo' })).toEqual({
      ok: false,
      reason: 'not_returned',
    });
    expect(await relistAsset(db, { id: 'nope', actor: 'dealer-demo' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});
