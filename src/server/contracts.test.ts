// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { loadAssets } from '@/data/load';
import { listAuditLog } from './audit';
import { seedAssets } from './assets';
import { getContract, signLease, type LeaseDataPack } from './contracts';
import { loadLeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

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
  await db.contract.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const aino = {
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  termMonths: 36,
  downPaymentCents: 0,
  today: '2026-11-05',
  actor: 'cust-aino',
};

describe('signLease', () => {
  it('prices on the server, stores the frozen contract and reserves the asset (card 1)', async () => {
    const result = await signLease(db, data, aino);
    expect(result).toMatchObject({
      ok: true,
      contract: {
        assetId: 'ebike-003',
        customerId: 'cust-aino',
        signDate: '2026-11-05',
        startDate: '2026-11-05',
        priceListVersion: 1,
        monthlyNetRentCents: 10_730, // 389 000 × 0.027584, DATA.md worked example
        billing: 'start_day_full_months',
      },
    });
    if (!result.ok) return;

    expect(await getContract(db, result.id)).toEqual({ id: result.id, contract: result.contract });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('reserved');
  });

  it('writes one audit row naming the new contract, in the same transaction', async () => {
    const result = await signLease(db, data, aino);
    if (!result.ok) throw new Error(result.reason);
    const log = await listAuditLog(db);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actor: 'cust-aino',
      action: 'contract.signed',
      entity_type: 'contract',
      entity_id: String(result.id),
      details: { assetId: 'ebike-003', monthlyNetRentCents: 10_730, priceListVersion: 1 },
    });
  });

  it('refuses an asset that is not available, and changes nothing', async () => {
    // ebike-009 is reserved in the data pack.
    expect(await signLease(db, data, { ...aino, assetId: 'ebike-009' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(0);
    expect(await listAuditLog(db)).toHaveLength(0);
  });

  it('cannot lease the same item twice', async () => {
    expect((await signLease(db, data, aino)).ok).toBe(true);
    expect(await signLease(db, data, { ...aino, customerId: 'cust-sanna' })).toEqual({
      ok: false,
      reason: 'asset_not_available',
    });
    expect(await db.contract.count()).toBe(1);
  });

  it('refuses unknown assets and customers', async () => {
    expect(await signLease(db, data, { ...aino, assetId: 'nope' })).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    expect(await signLease(db, data, { ...aino, customerId: 'nobody' })).toEqual({
      ok: false,
      reason: 'unknown_customer',
    });
  });

  it('passes on pricing refusals, such as a down payment off the slider step', async () => {
    expect(await signLease(db, data, { ...aino, downPaymentCents: 1 })).toEqual({
      ok: false,
      reason: 'down_payment_off_step',
    });
  });
});

describe('getContract', () => {
  it('returns null for an id that does not exist', async () => {
    expect(await getContract(db, 999_999)).toBeNull();
  });
});
