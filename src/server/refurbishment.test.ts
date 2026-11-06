import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import type { PrismaClient } from './prisma-client';
import { completeRefurbishment, quoteRefurbishment } from './refurbishment';
import { seedAssets } from './assets';

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
  await db.assetHistory.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, dataPack);
});

describe('quoteRefurbishment', () => {
  it('quotes returned assets without changing data', async () => {
    const result = await quoteRefurbishment(db, 'ebike-007', {});

    expect(result).toMatchObject({
      ok: true,
      asset: { id: 'ebike-007', status: 'returned', condition: 'fair' },
      quote: {
        targetCondition: 'good',
        conditionUpgradeCents: 12_000,
        totalCostCents: 51_500,
        usageAfterValue: 0,
      },
    });
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.assetHistory.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).status).toBe(
      'returned'
    );
  });

  it('rejects assets that are not in the returned pool', async () => {
    await expect(quoteRefurbishment(db, 'ebike-001', {})).resolves.toEqual({
      ok: false,
      reason: 'asset_not_returned',
      status: 'available',
    });
  });
});

describe('completeRefurbishment', () => {
  it('updates the asset, writes its passport, and audits the acceptance', async () => {
    const result = await completeRefurbishment(db, 'ebike-007', {
      completedOn: '2026-11-06',
      actor: 'team-test',
    });

    expect(result).toMatchObject({
      ok: true,
      asset: {
        id: 'ebike-007',
        status: 'available',
        condition: 'good',
        usage: { unit: 'km', value: 0 },
      },
      quote: { totalCostCents: 51_500 },
    });

    const history = await db.assetHistory.findMany({
      where: { asset_id: 'ebike-007' },
      orderBy: { id: 'asc' },
    });
    expect(history.map((entry) => entry.event_type)).toEqual([
      'condition_assessed',
      'refurbished',
      'made_available',
    ]);
    expect(history.at(-1)).toMatchObject({
      from_status: 'returned',
      to_status: 'available',
      condition: 'good',
      usage_value: 0,
      actor: 'team-test',
    });
    expect(await db.auditLog.findFirstOrThrow()).toMatchObject({
      action: 'asset.refurbished',
      entity_type: 'asset',
      entity_id: 'ebike-007',
      actor: 'team-test',
    });
  });

  it('does not change an asset when the accepted target is invalid', async () => {
    const result = await completeRefurbishment(db, 'ebike-007', {
      targetCondition: 'fair',
      completedOn: '2026-11-06',
      actor: 'team-test',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'minimum_condition_required',
      targetCondition: 'fair',
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } })).status).toBe(
      'returned'
    );
    expect(await db.assetHistory.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('rejects a second completion after the asset is available', async () => {
    await completeRefurbishment(db, 'ebike-007', {
      completedOn: '2026-11-06',
      actor: 'team-test',
    });

    await expect(
      completeRefurbishment(db, 'ebike-007', {
        completedOn: '2026-11-07',
        actor: 'team-test',
      })
    ).resolves.toEqual({ ok: false, reason: 'asset_not_returned', status: 'available' });
    expect(await db.auditLog.count()).toBe(1);
  });
});
