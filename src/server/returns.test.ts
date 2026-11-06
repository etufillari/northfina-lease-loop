import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import type { PrismaClient } from '@/generated/prisma/client';
import { createTestDb } from '../../tests/helpers/test-db';
import { createMockLeaseReader } from './returns/mock-lease-reader';
import { completeRefurbishmentWork, receiveAssetReturn } from './returns/service';
import type { ReturnLeaseRecord } from './returns/types';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let costs: Awaited<ReturnType<typeof loadRefurbishmentCosts>>;

const lease: ReturnLeaseRecord = {
  leaseId: 'lease-aino-1',
  contractId: 'contract-aino-1',
  assetId: 'ebike-003',
  status: 'COMPLETED',
};

const request = {
  leaseId: lease.leaseId,
  assetId: lease.assetId,
  idempotencyKey: 'return-aino-1',
  actor: 'operator-test',
  receivedOn: '2026-11-06',
  condition: 'fair' as const,
  usage: { unit: 'km' as const, value: 3_000 },
};

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  costs = await loadRefurbishmentCosts();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.refurbishmentWork.deleteMany();
  await db.assetReturn.deleteMany();
  await db.engineAllocation.deleteMany();
  await db.engineLease.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await db.asset.create({
    data: {
      id: lease.assetId,
      category: 'e_bike',
      make: 'Nordvolt',
      model: 'Trail 500',
      model_year: 2026,
      serial_number: 'LL-EB-RETURN-001',
      condition: 'good',
      usage_unit: 'km',
      usage_value: 2_500,
      previous_lives: 0,
      status: 'reserved',
      reserved_by: lease.contractId,
    },
  });
  await db.engineLease.create({
    data: {
      id: lease.leaseId,
      contractId: lease.contractId,
      assetId: lease.assetId,
      customerId: 'cust-aino',
      startDate: '2025-11-06',
      termMonths: 12,
      monthlyNetCents: 10_000,
      paymentDueDays: 14,
      status: lease.status,
    },
  });
  await db.engineAllocation.create({ data: { assetId: lease.assetId, leaseId: lease.leaseId } });
});

function mockLeaseReader(record: ReturnLeaseRecord = lease) {
  return createMockLeaseReader([record]);
}

describe('receiveAssetReturn', () => {
  it('records an eligible return and inspection while keeping the asset unavailable for work', async () => {
    const result = await receiveAssetReturn(db, mockLeaseReader(), costs, request);

    expect(result).toMatchObject({
      leaseId: lease.leaseId,
      assetId: lease.assetId,
      status: 'REFURBISHMENT_PENDING',
      condition: 'fair',
      usage: { unit: 'km', value: 3_000 },
      work: [
        {
          code: 'condition:fair->good',
          costCents: 12_000,
          mandatory: true,
          status: 'PENDING',
        },
      ],
    });
    expect(await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage_value: 3_000,
    });
    expect(await db.engineAllocation.findUnique({ where: { assetId: lease.assetId } })).toEqual({
      assetId: lease.assetId,
      leaseId: lease.leaseId,
    });
    expect(await db.auditLog.count()).toBe(1);
  });

  it('replays the same request without creating another return or audit entry', async () => {
    const first = await receiveAssetReturn(db, mockLeaseReader(), costs, request);
    const replay = await receiveAssetReturn(db, mockLeaseReader(), costs, request);

    expect(replay).toEqual(first);
    expect(await db.assetReturn.count()).toBe(1);
    expect(await db.refurbishmentWork.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it('rejects reuse of an idempotency key with changed return details', async () => {
    await receiveAssetReturn(db, mockLeaseReader(), costs, request);

    await expect(
      receiveAssetReturn(db, mockLeaseReader(), costs, {
        ...request,
        condition: 'good',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    expect(await db.assetReturn.count()).toBe(1);
    expect(await db.refurbishmentWork.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it('rejects an active lease before recording a return', async () => {
    await expect(
      receiveAssetReturn(db, mockLeaseReader({ ...lease, status: 'ACTIVE' }), costs, request)
    ).rejects.toMatchObject({ code: 'LEASE_NOT_RETURNABLE' });

    expect(await db.assetReturn.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('accepts a terminated lease when its allocation remains active', async () => {
    await db.engineLease.update({
      where: { id: lease.leaseId },
      data: { status: 'TERMINATED' },
    });

    const result = await receiveAssetReturn(
      db,
      mockLeaseReader({ ...lease, status: 'TERMINATED' }),
      costs,
      request
    );

    expect(result.status).toBe('REFURBISHMENT_PENDING');
    expect(await db.assetReturn.count()).toBe(1);
  });

  it('rejects a lease and asset pair that does not match', async () => {
    await expect(
      receiveAssetReturn(
        db,
        mockLeaseReader({ ...lease, assetId: 'another-asset' }),
        costs,
        request
      )
    ).rejects.toMatchObject({ code: 'LEASE_ASSET_MISMATCH' });

    expect(await db.assetReturn.count()).toBe(0);
  });

  it('rejects an inspection whose usage unit does not match the asset', async () => {
    await expect(
      receiveAssetReturn(db, mockLeaseReader(), costs, {
        ...request,
        usage: { unit: 'battery_cycles', value: 100 },
      })
    ).rejects.toMatchObject({ code: 'INVALID_INSPECTION' });

    expect(await db.assetReturn.count()).toBe(0);
    expect(await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).toMatchObject({
      status: 'reserved',
      usage_unit: 'km',
    });
  });

  it('rejects a lease whose allocation was released, such as after a buyout', async () => {
    await db.engineAllocation.delete({ where: { assetId: lease.assetId } });

    await expect(receiveAssetReturn(db, mockLeaseReader(), costs, request)).rejects.toMatchObject({
      code: 'ASSET_NOT_ALLOCATED',
    });
    expect(await db.assetReturn.count()).toBe(0);
  });

  it('requires replacement evidence when the inspected usage is lower than the recorded usage', async () => {
    await expect(
      receiveAssetReturn(db, mockLeaseReader(), costs, {
        ...request,
        usage: { unit: 'km', value: 2_000 },
      })
    ).rejects.toMatchObject({ code: 'USAGE_REDUCTION_EVIDENCE_REQUIRED' });

    expect(await db.assetReturn.count()).toBe(0);
  });

  it('records evidence when replacement justifies a lower inspected usage', async () => {
    const result = await receiveAssetReturn(db, mockLeaseReader(), costs, {
      ...request,
      usage: { unit: 'km', value: 2_000 },
      usageReductionEvidence: 'battery-replacement-2026-11-06',
    });

    expect(result.usageReductionEvidence).toBe('battery-replacement-2026-11-06');
    expect(
      await db.assetReturn.findUniqueOrThrow({ where: { id: result.returnId } })
    ).toMatchObject({
      usageValue: 2_000,
      usageReductionEvidence: 'battery-replacement-2026-11-06',
    });
  });

  it('rolls back return and asset changes if the audit insert fails', async () => {
    await db.$executeRaw`
      CREATE TRIGGER reject_asset_return_audit
      BEFORE INSERT ON AuditLog
      WHEN NEW.action = 'asset_return.received'
      BEGIN SELECT RAISE(ABORT, 'audit rejected'); END
    `;

    try {
      await expect(receiveAssetReturn(db, mockLeaseReader(), costs, request)).rejects.toThrow();
      expect(await db.assetReturn.count()).toBe(0);
      expect(await db.refurbishmentWork.count()).toBe(0);
      expect(await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).toMatchObject({
        status: 'reserved',
        reserved_by: lease.contractId,
        previous_lives: 0,
      });
      expect(await db.engineAllocation.findUnique({ where: { assetId: lease.assetId } })).toEqual({
        assetId: lease.assetId,
        leaseId: lease.leaseId,
      });
    } finally {
      await db.$executeRaw`DROP TRIGGER reject_asset_return_audit`;
    }
  });

  it('releases the asset and allocation only after mandatory work is complete', async () => {
    const receipt = await receiveAssetReturn(db, mockLeaseReader(), costs, request);
    const completed = await completeRefurbishmentWork(
      db,
      receipt.returnId,
      'condition:fair->good',
      { actor: 'operator-test', completedOn: '2026-11-07' }
    );

    expect(completed.status).toBe('READY');
    expect(completed.work[0]).toMatchObject({ status: 'COMPLETED', costCents: 12_000 });
    expect(await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).toMatchObject({
      status: 'available',
      condition: 'good',
    });
    expect(await db.engineAllocation.findUnique({ where: { assetId: lease.assetId } })).toBeNull();
    expect(await db.refurbishmentWork.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(2);
  });

  it('requires poor-to-fair work before fair-to-good work', async () => {
    const receipt = await receiveAssetReturn(db, mockLeaseReader(), costs, {
      ...request,
      condition: 'poor',
    });

    await expect(
      completeRefurbishmentWork(db, receipt.returnId, 'condition:fair->good', {
        actor: 'operator-test',
        completedOn: '2026-11-07',
      })
    ).rejects.toMatchObject({ code: 'WORK_OUT_OF_ORDER' });

    const first = await completeRefurbishmentWork(db, receipt.returnId, 'condition:poor->fair', {
      actor: 'operator-test',
      completedOn: '2026-11-07',
    });
    expect(first.status).toBe('REFURBISHMENT_PENDING');
    expect(first.work.find((item) => item.code === 'condition:poor->fair')?.status).toBe(
      'COMPLETED'
    );

    const ready = await completeRefurbishmentWork(db, receipt.returnId, 'condition:fair->good', {
      actor: 'operator-test',
      completedOn: '2026-11-08',
    });
    expect(ready.status).toBe('READY');
    expect(await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).toMatchObject({
      status: 'available',
      condition: 'good',
    });
    expect(await db.engineAllocation.findUnique({ where: { assetId: lease.assetId } })).toBeNull();
  });

  it('does not duplicate a completed work cost when completion is repeated', async () => {
    const receipt = await receiveAssetReturn(db, mockLeaseReader(), costs, request);
    await completeRefurbishmentWork(db, receipt.returnId, 'condition:fair->good', {
      actor: 'operator-test',
      completedOn: '2026-11-07',
    });

    await expect(
      completeRefurbishmentWork(db, receipt.returnId, 'condition:fair->good', {
        actor: 'operator-test',
        completedOn: '2026-11-07',
      })
    ).rejects.toMatchObject({ code: 'RETURN_NOT_PENDING' });

    expect(await db.refurbishmentWork.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(2);
  });
});
