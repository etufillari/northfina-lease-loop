import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadVatRates } from '@/data/load';
import type { VatRate } from '@/data/schemas';
import type { LeaseTerms } from '@/domain/lease-engine/types';
import type { PrismaClient } from '@/generated/prisma/client';
import * as audit from '@/server/audit';
import { createTestDb } from '../../../tests/helpers/test-db';
import { activateLease, activateLeaseInTransaction, completeLease, getLease } from './leases';
import { issueInvoice, listLeaseInvoices } from './invoices';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let rates: VatRate[];
const terms: LeaseTerms = {
  contractId: 'signed-aino-1',
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10730,
  paymentDueDays: 14,
};
const context = (key: string) => ({ actor: 'operator-test', idempotencyKey: key });
const activate = () => activateLease(db, context('activate-1'), terms, terms.startDate);

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  rates = (await loadVatRates()).rates;
});
afterAll(async () => {
  await cleanup();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await db.engineInvoice.deleteMany();
  await db.engineLease.deleteMany();
  await db.engineCommandReceipt.deleteMany();
  await db.engineInvoiceCounter.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
});

describe('persisted engine lifecycle', () => {
  it('activates, saves first three invoices once, and completes without releasing the asset', async () => {
    const asset = (await loadAssets()).find((item) => item.id === terms.assetId);
    if (!asset) throw new Error('Missing Aino asset fixture');
    const { usage, ...fields } = asset;
    // Fixture setup only: contract owner would reserve this in its real activation transaction.
    await db.asset.create({
      data: { ...fields, status: 'reserved', usage_unit: usage.unit, usage_value: usage.value },
    });
    const lease = await activate();
    expect(await getLease(db, lease.leaseId)).toEqual(lease);
    expect(await activate()).toEqual(lease);
    const invoices = [];
    for (const periodIndex of [1, 2, 3]) {
      invoices.push(
        await issueInvoice(
          db,
          context(`invoice-${periodIndex}`),
          { leaseId: lease.leaseId, periodIndex },
          rates
        )
      );
    }
    expect(invoices.map((i) => [i.issueDate, i.netCents, i.vatCents, i.grossCents])).toEqual([
      ['2026-11-05', 10730, 2736, 13466],
      ['2026-12-05', 10730, 2736, 13466],
      ['2027-01-05', 10730, 2790, 13520],
    ]);
    expect(invoices.map((i) => i.number)).toEqual([
      'LL-2026-000001',
      'LL-2026-000002',
      'LL-2027-000001',
    ]);
    expect(invoices[0]?.dueDate).toBe('2026-11-19');
    expect(await listLeaseInvoices(db, lease.leaseId)).toEqual(invoices);
    // A later rule-provider update must not rewrite the recorded request result.
    expect(
      await issueInvoice(db, context('invoice-1'), { leaseId: lease.leaseId, periodIndex: 1 }, [])
    ).toEqual(invoices[0]);
    expect(await db.engineInvoice.count()).toBe(3);
    expect(await db.engineLease.count()).toBe(1);
    const completed = await completeLease(
      db,
      context('complete-1'),
      lease.leaseId,
      '2029-11-05',
      1
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.version).toBe(2);
    expect(await completeLease(db, context('complete-1'), lease.leaseId, '2029-11-05', 1)).toEqual(
      completed
    );
    // Original activation result is an exact replay, not the now-completed state.
    expect(await activate()).toEqual(lease);
    expect((await db.asset.findUniqueOrThrow({ where: { id: terms.assetId } })).status).toBe(
      'reserved'
    );
    expect(await db.engineCommandReceipt.count()).toBe(5);
    expect(await db.auditLog.count()).toBeGreaterThanOrEqual(5);
  });

  it('rejects changed request payloads and another issuance key for the same period', async () => {
    const lease = await activate();
    await expect(
      activateLease(db, context('activate-1'), { ...terms, monthlyNetCents: 9000 }, terms.startDate)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      activateLease(db, context('activate-2'), terms, terms.startDate)
    ).rejects.toMatchObject({ code: 'LEASE_EXISTS' });
    await issueInvoice(db, context('invoice-1'), { leaseId: lease.leaseId, periodIndex: 1 }, rates);
    await expect(
      issueInvoice(db, context('invoice-1'), { leaseId: lease.leaseId, periodIndex: 2 }, rates)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      issueInvoice(db, context('other-key'), { leaseId: lease.leaseId, periodIndex: 1 }, rates)
    ).rejects.toMatchObject({ code: 'INVOICE_EXISTS' });
    expect(await db.engineInvoice.count()).toBe(1);
    expect(
      (await db.engineLease.findUniqueOrThrow({ where: { id: lease.leaseId } })).monthlyNetCents
    ).toBe(10730);
  });

  it('serializes simultaneous invoice commands without creating duplicates', async () => {
    const lease = await activate();
    const request = { leaseId: lease.leaseId, periodIndex: 1 };
    const [first, second] = await Promise.all([
      issueInvoice(db, context('same-key'), request, rates),
      issueInvoice(db, context('same-key'), request, rates),
    ]);
    expect(second).toEqual(first);
    expect(await db.engineInvoice.count()).toBe(1);
    expect((await db.engineInvoiceCounter.findUniqueOrThrow({ where: { year: 2026 } })).last).toBe(
      1
    );
    const requests = await Promise.allSettled([
      issueInvoice(db, context('different-key-1'), { ...request, periodIndex: 2 }, rates),
      issueInvoice(db, context('different-key-2'), { ...request, periodIndex: 2 }, rates),
    ]);
    expect(requests.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.engineInvoice.count()).toBe(2);
  });

  it('rolls back invoice, counter and receipt if audit insertion fails', async () => {
    const lease = await activate();
    const original = audit.withAudit;
    vi.spyOn(audit, 'withAudit').mockImplementation((client, entry, work) =>
      original(client, { ...entry, actor: undefined as unknown as string }, work)
    );
    await expect(
      issueInvoice(db, context('invoice-1'), { leaseId: lease.leaseId, periodIndex: 1 }, rates)
    ).rejects.toThrow();
    expect(await db.engineInvoice.count()).toBe(0);
    expect(await db.engineInvoiceCounter.count()).toBe(0);
    expect(await db.engineCommandReceipt.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it('rolls back an activation adapter together with the caller transaction', async () => {
    await expect(
      audit.withAudit(
        db,
        {
          actor: 'test',
          action: 'contract.activate',
          entityType: 'contract',
          entityId: terms.contractId,
        },
        async (tx) => {
          await activateLeaseInTransaction(tx, terms, terms.startDate);
          throw new Error('contract update failed');
        }
      )
    ).rejects.toThrow('contract update failed');
    expect(await db.engineLease.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect(await activate()).toMatchObject({ status: 'ACTIVE' });
  });

  it('rejects premature completion, stale versions and invalid transitions', async () => {
    await expect(
      activateLease(db, context('bad-start'), terms, '2026-11-06')
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    const lease = await activate();
    await expect(
      completeLease(db, context('early'), lease.leaseId, '2026-12-01', 1)
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(
      completeLease(db, context('stale'), lease.leaseId, '2029-11-05', 2)
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await completeLease(db, context('complete'), lease.leaseId, '2029-11-05', 1);
    await expect(
      completeLease(db, context('repeat'), lease.leaseId, '2029-11-05', 2)
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('rejects missing references, malformed input, missing tax and invalid period without writes', async () => {
    await expect(getLease(db, 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listLeaseInvoices(db, 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      completeLease(db, context('missing'), 'missing', '2029-11-05', 1)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      issueInvoice(db, context('missing'), { leaseId: 'missing', periodIndex: 1 }, rates)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      activateLease(db, context('invalid'), { ...terms, monthlyNetCents: -1 }, terms.startDate)
    ).rejects.toThrow();
    const lease = await activate();
    await expect(
      issueInvoice(db, context('missing-tax'), { leaseId: lease.leaseId, periodIndex: 1 }, [])
    ).rejects.toMatchObject({ code: 'INVALID_CALCULATION', reason: 'tax_rule_missing' });
    await expect(
      issueInvoice(db, context('bad-period'), { leaseId: lease.leaseId, periodIndex: 37 }, rates)
    ).rejects.toMatchObject({ code: 'INVALID_CALCULATION' });
    expect(await db.engineInvoice.count()).toBe(0);
    expect(await db.engineInvoiceCounter.count()).toBe(0);
  });
});
