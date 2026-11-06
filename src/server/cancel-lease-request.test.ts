import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { cancelLeaseRequest } from './cancel-lease-request';
import { createDemoLease } from './demo-lease';
import { requestLeaseChange } from './leases';
import { assessReturn } from './recovery';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
let contractId: string;
let otherContractId: string;
let requestId: string;
const today = '2026-11-06';
const actor = { customerId: 'owner-customer', userId: 'owner' };
const input = () => ({ ...actor, contractId, requestId });

beforeEach(async () => {
  fixture = await createTestDb();
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-005');
  if (!asset) throw new Error('Missing demo asset');
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: asset.id },
    async (tx) => {
      await tx.asset.create({ data: toAssetRowData(asset) });
      await tx.user.createMany({
        data: [
          { id: 'staff', name: 'Inspector', email: 'inspector@example.com', role: 'staff' },
          { id: 'owner', name: 'Owner', email: 'owner@example.com' },
          { id: 'other', name: 'Other', email: 'other@example.com' },
        ],
      });
      await tx.customer.createMany({
        data: [
          { id: actor.customerId, ownerUserId: actor.userId },
          { id: 'other-customer', ownerUserId: 'other' },
        ],
      });
    }
  );
  contractId = await createDemoLease(fixture.db, { ...actor, today });
  otherContractId = await createDemoLease(fixture.db, {
    customerId: 'other-customer',
    userId: 'other',
    today,
  });
  await requestLeaseChange(fixture.db, {
    customerId: 'other-customer',
    userId: 'other',
    contractId: otherContractId,
    kind: 'return',
    today,
  });
  requestId = (
    await requestLeaseChange(fixture.db, { ...actor, contractId, kind: 'return', today })
  ).id;
});

afterEach(async () => {
  await fixture.cleanup();
});

/** Use a real assessment snapshot, then arrange the lifecycle state being tested. */
async function prepareState(
  requestStatus: string,
  assessmentStatus: string | null,
  contractStatus = 'active'
) {
  if (assessmentStatus) {
    await assessReturn(fixture.db, {
      requestId,
      staffId: 'staff',
      today,
      inspection: {
        condition: 'fair',
        targetCondition: 'good',
        usageValue: 20000,
        ageMonths: 12,
        additionalRepairCents: 5000,
        notes: 'Brakes inspected before issuing the return quote.',
      },
    });
  }
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'lease_request', entityId: requestId },
    async (tx) => {
      await tx.contract.update({ where: { id: contractId }, data: { status: contractStatus } });
      await tx.leaseRequest.update({ where: { id: requestId }, data: { status: requestStatus } });
      if (assessmentStatus)
        await tx.returnAssessment.update({
          where: { requestId },
          data: { status: assessmentStatus },
        });
    }
  );
}

async function state() {
  const [requests, contracts, auditLog] = await Promise.all([
    fixture.db.leaseRequest.findMany({ include: { assessment: true }, orderBy: { id: 'asc' } }),
    fixture.db.contract.findMany({
      include: {
        asset: true,
        invoices: {
          include: { payments: { orderBy: { id: 'asc' } } },
          orderBy: { id: 'asc' },
        },
        events: { orderBy: { id: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    fixture.db.auditLog.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return { requests, contracts, auditLog };
}

function expectCancellationAudit(
  before: Awaited<ReturnType<typeof state>>,
  after: Awaited<ReturnType<typeof state>>
) {
  expect(after.auditLog).toEqual([
    ...before.auditLog,
    expect.objectContaining({
      actor: actor.userId,
      action: 'lease.request_cancelled',
      entity_type: 'lease_request',
      entity_id: requestId,
      details_json: null,
    }),
  ]);
}

const cancellableStates = ['pending', 'approved'].flatMap((requestStatus) =>
  [null, 'quoted', 'accepted'].map((assessmentStatus) => ({ requestStatus, assessmentStatus }))
);

describe('cancelLeaseRequest', () => {
  it.each(cancellableStates)(
    'cancels a $requestStatus request with a $assessmentStatus assessment and permits a new request',
    async ({ requestStatus, assessmentStatus }) => {
      await prepareState(requestStatus, assessmentStatus);
      const before = await state();

      expect(await cancelLeaseRequest(fixture.db, input())).toBe(requestId);

      const after = await state();
      expect(after.contracts).toEqual(before.contracts);
      expect(after.requests).toEqual(
        before.requests.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: 'cancelled',
                assessment: request.assessment
                  ? { ...request.assessment, status: 'cancelled', updatedAt: expect.any(Date) }
                  : null,
              }
            : request
        )
      );
      expectCancellationAudit(before, after);

      const next = await requestLeaseChange(fixture.db, {
        ...actor,
        contractId,
        kind: 'return',
        today,
      });
      expect(next.id).not.toBe(requestId);
      expect(next.status).toBe('pending');
    }
  );

  it.each(['active', 'returned'])(
    'leaves cancelled business state unchanged on retry with a %s contract and audits each call',
    async (contractStatus) => {
      await prepareState('approved', 'accepted');
      await cancelLeaseRequest(fixture.db, input());
      if (contractStatus !== 'active') await prepareCancelledContract(contractStatus);
      const before = await state();

      expect(await cancelLeaseRequest(fixture.db, input())).toBe(requestId);

      const after = await state();
      expect(after.requests).toEqual(before.requests);
      expect(after.contracts).toEqual(before.contracts);
      // withAudit records every successful invocation, including state-preserving retries.
      expectCancellationAudit(before, after);
      expect(
        after.auditLog.filter((entry) => entry.action === 'lease.request_cancelled')
      ).toHaveLength(2);
    }
  );

  it.each(['missing request', 'mismatched contract', 'another customer'])(
    'returns the same not-found error for %s without changing data or recording cancellation',
    async (scenario) => {
      await prepareState('approved', 'quoted');
      const before = await state();
      const changes =
        scenario === 'missing request'
          ? { requestId: 'missing' }
          : scenario === 'mismatched contract'
            ? { contractId: otherContractId }
            : { customerId: 'other-customer', userId: 'other' };

      await expect(
        cancelLeaseRequest(fixture.db, { ...input(), ...changes })
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Request not found.',
      });
      expect(await state()).toEqual(before);
    }
  );

  it.each(['awaiting_signature', 'completed', 'returned', 'bought'])(
    'rejects cancellation on a %s contract without changing business data or its audit trail',
    async (contractStatus) => {
      await prepareState('approved', 'accepted', contractStatus);
      await expectCannotCancel();
    }
  );

  it('rejects a rejected request even while its assessment is still quoted', async () => {
    await prepareState('rejected', 'quoted');
    await expectCannotCancel();
  });

  it.each(['received', 'ready', 'published', 'retired', 'bought', 'cancelled'])(
    'rejects a %s assessment even while its contract is active and request approved',
    async (assessmentStatus) => {
      await prepareState('approved', assessmentStatus);
      await expectCannotCancel();
    }
  );

  it('rolls back both cancellation writes when the audit insert fails', async () => {
    await prepareState('approved', 'accepted');
    const before = await state();

    // As in audit.test.ts, a missing required actor forces a real audit-insert failure
    // after the callback has updated both the assessment and the request.
    await expect(
      cancelLeaseRequest(fixture.db, { ...input(), userId: undefined as unknown as string })
    ).rejects.toMatchObject({
      name: 'PrismaClientValidationError',
      message: expect.stringContaining('actor'),
    });

    expect(await state()).toEqual(before);
    expect(await cancelLeaseRequest(fixture.db, input())).toBe(requestId);
    const after = await state();
    expect(after.requests.find((request) => request.id === requestId)).toMatchObject({
      status: 'cancelled',
      assessment: { status: 'cancelled' },
    });
    expectCancellationAudit(before, after);
  });
});

async function expectCannotCancel() {
  const before = await state();
  await expect(cancelLeaseRequest(fixture.db, input())).rejects.toMatchObject({
    status: 409,
    code: 'CANNOT_CANCEL',
  });
  expect(await state()).toEqual(before);
}

async function prepareCancelledContract(status: string) {
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'contract', entityId: contractId },
    (tx) => tx.contract.update({ where: { id: contractId }, data: { status } })
  );
}
