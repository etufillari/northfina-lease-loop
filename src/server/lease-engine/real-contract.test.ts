import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadVatRates } from '@/data/load';
import { submitApplication, signContract, listContractsForCustomer } from '@/server/applications';
import * as audit from '@/server/audit';
import { toAssetRowData } from '@/server/assets';
import { createTestDb } from '../../../tests/helpers/test-db';
import { signAndActivateContract, activateExistingContract } from './real-contract';
import { issueInvoice } from './invoices';
import { completeLease } from './leases';

let database: Awaited<ReturnType<typeof createTestDb>>;
const date = new Date('2026-11-05T12:00:00.000Z');
const sign = {
  applicationId: 'real-app',
  contractId: 'real-contract',
  signerId: 'cust-aino',
  signedAt: date,
  actor: 'cust-aino',
};
beforeAll(async () => {
  database = await createTestDb();
});
afterAll(async () => {
  await database.cleanup();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const db = database.db;
  await db.engineAllocation.deleteMany();
  await db.engineInvoice.deleteMany();
  await db.engineLease.deleteMany();
  await db.engineCommandReceipt.deleteMany();
  await db.engineInvoiceCounter.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-003');
  if (!asset) throw new Error('missing fixture');
  await db.asset.create({ data: { ...toAssetRowData(asset), status: 'available' } });
  const result = await submitApplication(
    db,
    {
      applicationId: sign.applicationId,
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      startDate: '2026-11-05',
      termMonths: 36,
      downPaymentCents: 0,
      priceListVersion: 1,
      offerExpiresOn: '2026-11-06',
      actor: 'cust-aino',
    },
    date
  );
  expect(result.ok && result.application.status).toBe('APPROVED');
});

describe('real Dev2 signed contract to engine integration', () => {
  it('signs and activates atomically, issues VAT-changing invoices and projects real completion', async () => {
    const db = database.db;
    expect((await signAndActivateContract(db, sign)).ok).toBe(true);
    const lease = await db.engineLease.findUniqueOrThrow({
      where: { contractId: sign.contractId },
    });
    expect(lease.monthlyNetCents).toBe(10730);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.reserved_by).toBe(sign.contractId);
    expect(asset.reserved_until).toBeNull();
    expect(await db.engineAllocation.count()).toBe(1);
    for (const [periodIndex, expectedGross] of [
      [1, 13466],
      [2, 13466],
      [3, 13520],
    ]) {
      const invoice = await issueInvoice(
        db,
        { actor: 'demo:cust-aino', idempotencyKey: `real:${periodIndex}` },
        { leaseId: lease.id, periodIndex: periodIndex ?? 1 },
        (await loadVatRates()).rates
      );
      expect(invoice.grossCents).toBe(expectedGross);
    }
    expect((await listContractsForCustomer(db, 'cust-aino'))[0]).toMatchObject({
      status: 'ACTIVE',
      leaseId: lease.id,
      latestInvoicePaid: false,
    });
    await completeLease(
      db,
      { actor: 'demo:cust-aino', idempotencyKey: 'real-complete' },
      lease.id,
      '2029-11-05',
      1
    );
    expect((await listContractsForCustomer(db, 'cust-aino'))[0]?.status).toBe('COMPLETED');
    expect(await db.engineAllocation.count()).toBe(1);
    expect((await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe('reserved');
    expect((await signAndActivateContract(db, sign)).ok).toBe(false);
    expect(await db.engineLease.count()).toBe(1);
  });

  it('rolls back real contract, signing, lease and allocation when audit insertion fails', async () => {
    const original = audit.withAudit;
    vi.spyOn(audit, 'withAudit').mockImplementation((db, entry, work) =>
      original(db, { ...entry, actor: undefined as unknown as string }, work)
    );
    await expect(signAndActivateContract(database.db, sign)).rejects.toThrow();
    expect(await database.db.contract.count()).toBe(0);
    expect(await database.db.engineLease.count()).toBe(0);
    expect(await database.db.engineAllocation.count()).toBe(0);
    expect(
      (await database.db.application.findUniqueOrThrow({ where: { id: sign.applicationId } }))
        .signed_at
    ).toBeNull();
    expect((await database.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'available'
    );
  });

  it('activates a previously signed contract once and refuses allocation lost to another owner', async () => {
    const db = database.db;
    expect((await signContract(db, sign)).ok).toBe(true);
    expect((await listContractsForCustomer(db, 'cust-aino'))[0]?.status).toBe('SIGNED');
    const context = { actor: 'demo:cust-aino', idempotencyKey: 'existing' };
    const first = await activateExistingContract(db, context, sign.contractId);
    expect(await activateExistingContract(db, context, sign.contractId)).toEqual(first);
    expect(
      await activateExistingContract(db, { ...context, idempotencyKey: 'new-key' }, sign.contractId)
    ).toEqual(first);
    expect(await db.engineAllocation.count()).toBe(1);
    await expect(activateExistingContract(db, context, 'missing')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      activateExistingContract(db, { ...context, idempotencyKey: 'missing' }, 'missing')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not activate a signed contract when its reservation belongs to another contract', async () => {
    const db = database.db;
    await signContract(db, sign);
    await db.asset.update({ where: { id: 'ebike-003' }, data: { reserved_by: 'other-contract' } });
    await expect(
      activateExistingContract(db, { actor: 'demo', idempotencyKey: 'lost' }, sign.contractId)
    ).rejects.toMatchObject({ reason: 'asset_not_allocated_to_contract' });
    expect(await db.engineLease.count()).toBe(0);
  });
});
