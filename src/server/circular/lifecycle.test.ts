import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadVatRates } from '@/data/load';
import { toAssetRowData } from '@/server/assets';
import { submitApplication } from '@/server/applications';
import { signAndActivateContract } from '@/server/lease-engine/real-contract';
import { issueInvoice } from '@/server/lease-engine/invoices';
import { completeLease } from '@/server/lease-engine/leases';
import * as audit from '@/server/audit';
import { createTestDb } from '../../../tests/helpers/test-db';
import {
  receiveReturn,
  inspectReturn,
  finishRefurbishment,
  requestReturn,
  reviewRefurbishment,
} from './service';
import { circularDashboard } from './queries';
import type { WorkPlan } from '@/domain/circular/refurbishment';
import { latestLifecycleDate } from '@/domain/circular/workflow-date';
let database: Awaited<ReturnType<typeof createTestDb>>;
const ctx = (key: string) => ({ actor: 'demo-operator', idempotencyKey: key });
beforeAll(async () => {
  database = await createTestDb();
});
afterAll(async () => {
  await database.cleanup();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const db = database.db;
  await db.leaseSettlement.deleteMany();
  await db.circularOffer.deleteMany();
  await db.assetReturn.deleteMany();
  await db.engineAllocation.deleteMany();
  await db.engineInvoice.deleteMany();
  await db.engineLease.deleteMany();
  await db.engineCommandReceipt.deleteMany();
  await db.engineInvoiceCounter.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await db.asset.createMany({ data: (await loadAssets()).map(toAssetRowData) });
});
async function signed(
  assetId: string,
  customerId: string,
  date: string,
  suffix: string,
  termMonths: 12 | 24 | 36 | 48 = 36
) {
  const db = database.db;
  const app = await submitApplication(
    db,
    {
      applicationId: `app-${suffix}`,
      assetId,
      customerId,
      startDate: date,
      termMonths,
      downPaymentCents: 0,
      offerExpiresOn: date,
      actor: customerId,
    },
    new Date(date + 'T12:00:00.000Z')
  );
  expect(app.ok && app.application.status).toBe('APPROVED');
  const result = await signAndActivateContract(db, {
    applicationId: `app-${suffix}`,
    contractId: `contract-${suffix}`,
    signerId: customerId,
    signedAt: new Date(date + 'T12:00:00.000Z'),
    actor: customerId,
  });
  expect(result.ok).toBe(true);
  return db.engineLease.findUniqueOrThrow({ where: { contractId: `contract-${suffix}` } });
}
async function restore(returnId: string, condition: string, usageValue: number, date: string) {
  const inspected = await inspectReturn(database.db, ctx('inspect:' + returnId), {
    returnId,
    condition,
    usageValue,
  });
  const plan: WorkPlan = JSON.parse(inspected.planJson ?? '{}');
  const finished = await finishRefurbishment(database.db, ctx('finish:' + returnId), {
    returnId,
    completedWorkIds: plan.steps.map((s) => s.id),
    completedOn: date,
  });
  return finished.receipt.status === 'PENDING_APPROVAL'
    ? reviewRefurbishment(database.db, ctx('approve:' + returnId), {
        returnId,
        decision: 'APPROVE',
        reviewedOn: date,
      })
    : finished;
}
describe('complete persisted circular lease lifecycle', () => {
  it('completes future-dated demo refurbishment and returns the asset to the catalogue', async () => {
    const db = database.db;
    const lease = await signed('ebike-003', 'cust-aino', '2026-11-06', 'future-demo', 24);
    await completeLease(db, ctx('future-demo-complete'), lease.id, '2028-11-06', 1);
    const requested = await requestReturn(db, ctx('future-demo-request'), {
      leaseId: lease.id,
      customerId: 'cust-aino',
      usageValue: 50,
      requestedOn: '2028-11-06',
    });
    const received = await receiveReturn(db, ctx('future-demo-receive'), {
      returnId: requested.id,
      receivedOn: latestLifecycleDate('2026-11-06', requested.requestedOn),
    });
    const inspected = await inspectReturn(db, ctx('future-demo-inspect'), {
      returnId: received.id,
      condition: 'good',
      usageValue: 50,
    });
    const plan: WorkPlan = JSON.parse(inspected.planJson ?? '{}');
    const finished = await finishRefurbishment(db, ctx('future-demo-finish'), {
      returnId: received.id,
      completedWorkIds: plan.steps.map((step) => step.id),
      completedOn: latestLifecycleDate('2026-11-06', received.receivedOn),
    });

    expect(finished.receipt.status).toBe('PENDING_APPROVAL');
    const approved = await reviewRefurbishment(db, ctx('future-demo-approve'), {
      returnId: received.id,
      decision: 'APPROVE',
      reviewedOn: latestLifecycleDate('2026-11-06', finished.receipt.completedOn),
    });

    expect(approved.receipt.status).toBe('READY');
    expect((await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).status).toBe(
      'available'
    );
    const relistedLease = await signed(
      lease.assetId,
      'cust-lena',
      '2028-11-06',
      'future-demo-relist'
    );
    expect(relistedLease.assetId).toBe(lease.assetId);
  });

  it('keeps a customer-returned asset unavailable until company approval', async () => {
    const db = database.db;
    const first = await signed('ebike-003', 'cust-aino', '2026-11-05', 'customer-return');
    await completeLease(db, ctx('complete-customer-return'), first.id, '2029-11-05', 1);
    const livesBeforeReturn = (await db.asset.findUniqueOrThrow({ where: { id: first.assetId } }))
      .previous_lives;

    const requested = await requestReturn(
      db,
      {
        actor: 'cust-aino',
        idempotencyKey: 'request-return',
      },
      {
        leaseId: first.id,
        customerId: 'cust-aino',
        usageValue: 18400,
        requestedOn: '2029-11-05',
      }
    );

    expect(requested.status).toBe('REQUESTED');
    expect(requested.receivedOn).toBeNull();
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).usage_value).toBe(
      18400
    );
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).previous_lives
    ).toBe(livesBeforeReturn + 1);
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).status).toBe(
      'returned'
    );
    await expect(
      submitApplication(
        db,
        {
          applicationId: 'blocked-before-approval',
          assetId: first.assetId,
          customerId: 'cust-lena',
          startDate: '2029-11-05',
          termMonths: 36,
          downPaymentCents: 0,
          offerExpiresOn: '2029-11-05',
          actor: 'cust-lena',
        },
        new Date('2029-11-05T12:00:00.000Z')
      )
    ).resolves.toMatchObject({ ok: false, reason: 'asset_unavailable' });

    const received = await receiveReturn(db, ctx('physical-receipt'), {
      returnId: requested.id,
      receivedOn: '2029-11-06',
    });
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).previous_lives
    ).toBe(livesBeforeReturn + 1);
    const inspected = await inspectReturn(db, ctx('customer-inspection'), {
      returnId: received.id,
      condition: 'fair',
      usageValue: 18400,
    });
    const plan: WorkPlan = JSON.parse(inspected.planJson ?? '{}');
    const finished = await finishRefurbishment(db, ctx('customer-finish'), {
      returnId: received.id,
      completedWorkIds: plan.steps.map((step) => step.id),
      completedOn: '2029-11-10',
    });

    expect(finished.receipt.status).toBe('PENDING_APPROVAL');
    expect(finished.offer).toBeNull();
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).status).toBe(
      'returned'
    );
    await expect(
      submitApplication(
        db,
        {
          applicationId: 'blocked-pending-approval',
          assetId: first.assetId,
          customerId: 'cust-lena',
          startDate: '2029-11-10',
          termMonths: 36,
          downPaymentCents: 0,
          offerExpiresOn: '2029-11-10',
          actor: 'cust-lena',
        },
        new Date('2029-11-10T12:00:00.000Z')
      )
    ).resolves.toMatchObject({ ok: false, reason: 'asset_unavailable' });

    const approved = await reviewRefurbishment(db, ctx('approve-customer-return'), {
      returnId: received.id,
      decision: 'APPROVE',
      reviewedOn: '2029-11-11',
    });
    expect(approved.receipt.status).toBe('READY');
    expect(approved.offer?.returnId).toBe(received.id);
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).status).toBe(
      'available'
    );
    const second = await signed(first.assetId, 'cust-lena', '2029-11-11', 'after-approval');
    expect(second.assetId).toBe(first.assetId);
    const approvalAudit = await db.auditLog.findFirstOrThrow({
      where: { entity_id: received.id, action: 'engine.circular_review_return_command' },
    });
    expect(approvalAudit.actor).toBe('demo-operator');
    expect(JSON.parse(approvalAudit.details_json ?? '{}')).toMatchObject({
      decision: 'APPROVE',
      reviewedOn: '2029-11-11',
    });
  });

  it('keeps a rejected refurbishment unavailable and records the company decision', async () => {
    const db = database.db;
    const lease = await signed('ebike-003', 'cust-aino', '2026-11-05', 'reject-return');
    await completeLease(db, ctx('reject-complete'), lease.id, '2029-11-05', 1);
    const receipt = await receiveReturn(db, ctx('reject-receive'), {
      assetId: lease.assetId,
      leaseId: lease.id,
      receivedOn: '2029-11-05',
    });
    const inspected = await inspectReturn(db, ctx('reject-inspect'), {
      returnId: receipt.id,
      condition: 'good',
      usageValue: 18400,
    });
    const plan: WorkPlan = JSON.parse(inspected.planJson ?? '{}');
    await finishRefurbishment(db, ctx('reject-finish'), {
      returnId: receipt.id,
      completedWorkIds: plan.steps.map((step) => step.id),
      completedOn: '2029-11-06',
    });

    const rejected = await reviewRefurbishment(db, ctx('reject-review'), {
      returnId: receipt.id,
      decision: 'REJECT',
      reason: 'Safety documentation is incomplete',
      reviewedOn: '2029-11-07',
    });

    expect(rejected.receipt.status).toBe('REJECTED');
    expect(rejected.receipt.reviewReason).toBe('Safety documentation is incomplete');
    expect(rejected.offer).toBeNull();
    expect(await db.circularOffer.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).status).toBe(
      'returned'
    );
    const rejectionAudit = await db.auditLog.findFirstOrThrow({
      where: { entity_id: receipt.id, action: 'engine.circular_review_return_command' },
    });
    expect(JSON.parse(rejectionAudit.details_json ?? '{}')).toMatchObject({
      decision: 'REJECT',
      reason: 'Safety documentation is incomplete',
    });
  });

  it('saves completed work on a low-value imported laptop without publishing a lease offer', async () => {
    const db = database.db;
    const receipt = await receiveReturn(db, ctx('low-receive'), {
      assetId: 'laptop-006',
      receivedOn: '2026-11-06',
    });
    const result = await restore(receipt.id, 'good', 310, '2026-11-06');
    expect(result.receipt.status).toBe('REVIEW_REQUIRED');
    expect(result.receipt.costCents).toBe(2500);
    expect(result.receipt.completedOn).toBe('2026-11-06');
    expect(result.receipt.offerNetCents).toBeLessThan(30000);
    expect(result.offer).toBeNull();
    expect(await db.circularOffer.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'laptop-006' } })).status).toBe(
      'returned'
    );
  });

  it('uses the stored original price-list version when valuing a legacy contract without financed snapshots', async () => {
    const db = database.db;
    const first = await signed('ebike-003', 'cust-aino', '2026-11-06', 'legacy-v2');
    await db.contract.update({ where: { id: first.contractId }, data: { financed_cents: 0 } });
    await completeLease(db, ctx('legacy-complete'), first.id, '2029-11-06', 1);
    const receipt = await receiveReturn(db, ctx('legacy-receive'), {
      assetId: first.assetId,
      leaseId: first.id,
      receivedOn: '2029-11-06',
    });
    const ready = await restore(receipt.id, 'good', 100, '2029-11-06');
    expect(ready.offer?.netListCents).toBe(112821);
  });

  it('card2 locks a real saved v1 quote when signing the next day after v2 starts', async () => {
    const db = database.db;
    const result = await submitApplication(
      db,
      {
        applicationId: 'quote-v1',
        customerId: 'cust-aino',
        assetId: 'laptop-004',
        startDate: '2026-11-05',
        termMonths: 36,
        downPaymentCents: 0,
        priceListVersion: 1,
        offerExpiresOn: '2026-11-06',
        actor: 'cust-aino',
      },
      new Date('2026-11-05T12:00:00Z')
    );
    if (!result.ok) throw new Error('quote rejected');
    const quoted = result.application.monthly_net_cents;
    const signed = await signAndActivateContract(db, {
      applicationId: 'quote-v1',
      contractId: 'quote-signed',
      signerId: 'cust-aino',
      signedAt: new Date('2026-11-06T12:00:00Z'),
      actor: 'cust-aino',
    });
    expect(signed.ok && signed.contract.monthly_net_cents).toBe(quoted);
    expect(signed.ok && signed.contract.price_list_version).toBe(1);
    const lease = await db.engineLease.findUniqueOrThrow({ where: { contractId: 'quote-signed' } });
    expect(lease.monthlyNetCents).toBe(quoted);
  });

  it('signs, invoices, returns, refurbishes and re-leases the SAME asset to a second customer', async () => {
    const db = database.db;
    const first = await signed('ebike-003', 'cust-aino', '2026-11-05', 'first');
    const original = await issueInvoice(
      db,
      ctx('first-invoice'),
      { leaseId: first.id, periodIndex: 1 },
      (await loadVatRates()).rates
    );
    expect(original.grossCents).toBe(13466);
    await expect(
      receiveReturn(db, ctx('too-early'), {
        assetId: first.assetId,
        leaseId: first.id,
        receivedOn: '2029-11-05',
      })
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await completeLease(db, ctx('complete-first'), first.id, '2029-11-05', 1);
    const input = { assetId: first.assetId, leaseId: first.id, receivedOn: '2029-11-05' };
    const receipt = await receiveReturn(db, ctx('receive-first'), input);
    expect(await receiveReturn(db, ctx('receive-first'), input)).toEqual(receipt);
    expect(
      (await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).previous_lives
    ).toBe(1);
    const report = await inspectReturn(db, ctx('inspect-first'), {
      returnId: receipt.id,
      condition: 'fair',
      usageValue: 18400,
    });
    const plan: WorkPlan = JSON.parse(report.planJson ?? '{}');
    await expect(
      finishRefurbishment(db, ctx('missing-work'), {
        returnId: receipt.id,
        completedWorkIds: [],
        completedOn: '2029-11-05',
      })
    ).rejects.toMatchObject({ reason: 'mandatory_work_incomplete' });
    expect(await db.engineAllocation.count()).toBe(1);
    const finish = {
      returnId: receipt.id,
      completedWorkIds: plan.steps.map((s) => s.id),
      completedOn: '2029-11-05',
    };
    const ready = await finishRefurbishment(db, ctx('ready'), finish);
    expect(await finishRefurbishment(db, ctx('ready'), finish)).toEqual(ready);
    expect(ready.receipt.status).toBe('PENDING_APPROVAL');
    expect(ready.offer).toBeNull();
    expect(await db.engineAllocation.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.assetId } })).status).toBe(
      'returned'
    );
    const approved = await reviewRefurbishment(db, ctx('approve-ready'), {
      returnId: receipt.id,
      decision: 'APPROVE',
      reviewedOn: '2029-11-05',
    });
    const second = await signed(first.assetId, 'cust-lena', '2029-11-05', 'second');
    expect(second.id).not.toBe(first.id);
    expect(second.contractId).not.toBe(first.contractId);
    expect(second.assetId).toBe(first.assetId);
    const secondContract = await db.contract.findUniqueOrThrow({
      where: { id: second.contractId },
    });
    expect(secondContract.circular_offer_id).toBe(approved.offer?.id);
    expect(secondContract.financed_cents).toBe(approved.offer?.netListCents);
    expect(await db.engineAllocation.count()).toBe(1);
    const secondInvoice = await issueInvoice(
      db,
      ctx('second-invoice'),
      { leaseId: second.id, periodIndex: 1 },
      (await loadVatRates()).rates
    );
    expect(secondInvoice.tax.rateBps).toBe(2600);
    expect(
      (await db.engineInvoice.findUniqueOrThrow({ where: { id: original.invoiceId } })).netCents
    ).toBe(10730);
    const passport = (await circularDashboard(db)).find((row) => row.asset.id === first.assetId);
    expect(passport?.history).toHaveLength(2);
    expect(passport?.impactGrams).toBeGreaterThan(0);
  });
  it('handles card9 imported return with all work, matching and no invented lease history', async () => {
    const db = database.db;
    const receipt = await receiveReturn(db, ctx('card9'), {
      assetId: 'ebike-007',
      receivedOn: '2026-11-06',
    });
    const ready = await restore(receipt.id, 'fair', 18400, '2026-11-06');
    expect(ready.receipt.costCents).toBe(51500);
    const row = (await circularDashboard(db)).find((row) => row.asset.id === 'ebike-007');
    expect(
      row?.matches
        .filter((m) => ['wait-02', 'wait-13'].includes(m.requestId))
        .map((m) => m.requestId)
    ).toEqual(['wait-02', 'wait-13']);
    expect(row?.history).toHaveLength(0);
    expect(row?.asset.previous_lives).toBe(1);
  });
  it('leases card10 third-life asset with passport and fictional impact', async () => {
    const db = database.db;
    const receipt = await receiveReturn(db, ctx('card10'), {
      assetId: 'ebike-008',
      receivedOn: '2026-11-06',
    });
    await restore(receipt.id, 'good', 9800, '2026-11-06');
    await signed('ebike-008', 'cust-aino', '2026-11-06', 'third');
    const row = (await circularDashboard(db)).find((row) => row.asset.id === 'ebike-008');
    expect(row?.asset.previous_lives).toBe(2);
    expect(row?.history).toHaveLength(1);
    expect(row?.impactGrams).toBe(290400);
  });
  it('rolls back real readiness, offer and allocation release when audit fails', async () => {
    const db = database.db;
    const lease = await signed('ebike-003', 'cust-aino', '2026-11-05', 'rollback');
    await completeLease(db, ctx('complete'), lease.id, '2029-11-05', 1);
    const receipt = await receiveReturn(db, ctx('receive'), {
      assetId: lease.assetId,
      leaseId: lease.id,
      receivedOn: '2029-11-05',
    });
    const report = await inspectReturn(db, ctx('inspect'), {
      returnId: receipt.id,
      condition: 'good',
      usageValue: 100,
    });
    const plan: WorkPlan = JSON.parse(report.planJson ?? '{}');
    const original = audit.withAudit;
    vi.spyOn(audit, 'withAudit').mockImplementation((client, entry, work) =>
      original(client, { ...entry, actor: undefined as unknown as string }, work)
    );
    await expect(
      finishRefurbishment(db, ctx('finish'), {
        returnId: receipt.id,
        completedWorkIds: plan.steps.map((s) => s.id),
        completedOn: '2029-11-05',
      })
    ).rejects.toThrow();
    expect(await db.engineAllocation.count()).toBe(1);
    expect(await db.circularOffer.count()).toBe(0);
    expect((await db.asset.findUniqueOrThrow({ where: { id: lease.assetId } })).status).toBe(
      'returned'
    );
  });
});
