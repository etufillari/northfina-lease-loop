import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { loadPricingData, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';
import { approveReturnPlan, completeReturn } from './return-completion';
import { createReturnRequest, inspectReturn, markReturnReceived, planReturn } from './returns';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let pricing: PricingData;

const actor = 'test-dealer';
const customerId = 'cust-aino';

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  pricing = await loadPricingData();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.returnRequest.deleteMany();
  await db.auditLog.deleteMany();
  await db.invoice.deleteMany();
  await db.contract.deleteMany();
  await db.quote.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

function errorCode(promise: Promise<unknown>) {
  return promise.then(
    () => 'NO_ERROR',
    (error: unknown) => (error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR')
  );
}

type Step = 'requested' | 'received' | 'inspected' | 'planned' | 'approved';

/** A lease on `assetId`, returned and walked to `upTo`. */
async function returnAt(upTo: Step, assetId = 'ebike-003') {
  const quote = await createQuote(db, pricing, {
    assetId,
    termMonths: 36,
    onDate: '2026-11-05',
    downPaymentCents: 0,
    actor: 'test',
  });
  const contract = await signContract(db, pricing, {
    quoteId: quote.id,
    customerId,
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    accepted: quote,
    actor: 'test',
  });
  const request = await createReturnRequest(db, {
    contractId: contract.id,
    customerId,
    expectedReturnDate: '2026-11-10',
    actor: customerId,
  });
  const steps: Step[] = ['requested', 'received', 'inspected', 'planned', 'approved'];
  const reached = steps.indexOf(upTo);
  if (reached >= 1) await markReturnReceived(db, request.id, { actor });
  if (reached >= 2) {
    await inspectReturn(db, request.id, { condition: 'fair', usageValue: 18_400, actor });
  }
  if (reached >= 3) await planReturn(db, request.id, { targetCondition: 'good', actor });
  if (reached >= 4) await approveReturnPlan(db, request.id, { actor });
  return { contract, request };
}

describe('approveReturnPlan', () => {
  it('approves a planned return, recording who and when, and leaves the asset alone', async () => {
    const { contract, request } = await returnAt('planned');
    const assetBefore = await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } });

    const result = await approveReturnPlan(db, request.id, { actor: 'approver' });

    expect(result).toMatchObject({ status: 'approved', approved_by: 'approver' });
    expect(result.approved_at).toBeInstanceOf(Date);
    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toEqual(
      assetBefore
    );

    const audit = await db.auditLog.findFirst({
      where: { action: 'return.approved', entity_id: request.id },
    });

    expect(audit).toMatchObject({ actor: 'approver', entity_type: 'return_request' });
    expect(JSON.parse(audit?.details_json ?? '{}')).toMatchObject({
      assetId: contract.assetId,
      targetCondition: 'good',
      totalCostCents: result.refurbishment_total_cost_cents,
    });
  });

  it.each(['requested', 'received', 'inspected'] as const)(
    'refuses a return that is only %s',
    async (step) => {
      const { request } = await returnAt(step);

      expect(await errorCode(approveReturnPlan(db, request.id, { actor }))).toBe(
        'RETURN_NOT_PLANNED'
      );
      expect(await db.auditLog.count({ where: { action: 'return.approved' } })).toBe(0);
    }
  );

  it('does not approve twice', async () => {
    const { request } = await returnAt('approved');

    expect(await errorCode(approveReturnPlan(db, request.id, { actor }))).toBe(
      'RETURN_NOT_PLANNED'
    );
  });

  it('rejects an unknown return request', async () => {
    expect(await errorCode(approveReturnPlan(db, 'missing', { actor }))).toBe(
      'RETURN_REQUEST_NOT_FOUND'
    );
  });

  it('rejects an empty actor and extra fields', async () => {
    const { request } = await returnAt('planned');

    expect(await errorCode(approveReturnPlan(db, request.id, { actor: ' ' }))).not.toBe('NO_ERROR');
    expect(
      await errorCode(
        approveReturnPlan(db, request.id, { actor, extra: 1 } as unknown as { actor: string })
      )
    ).not.toBe('NO_ERROR');
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
      'planned'
    );
  });
});

describe('completeReturn', () => {
  it('applies the plan to the asset and makes it available', async () => {
    const { contract, request } = await returnAt('approved');

    const result = await completeReturn(db, request.id, { actor: 'finisher' });

    expect(result).toMatchObject({ status: 'completed', completed_by: 'finisher' });
    expect(result.completed_at).toBeInstanceOf(Date);

    // The e-bike was returned fair at 18,400 km; the plan raised it to good and replaced the battery.
    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      status: 'available',
      condition: 'good',
      usage_value: 0,
    });
  });

  it('writes the before and after values to the audit log', async () => {
    const { contract, request } = await returnAt('approved');

    await completeReturn(db, request.id, { actor: 'finisher' });

    const audit = await db.auditLog.findFirst({
      where: { action: 'return.completed', entity_id: request.id },
    });

    expect(audit).toMatchObject({ actor: 'finisher', entity_type: 'return_request' });
    expect(JSON.parse(audit?.details_json ?? '{}')).toMatchObject({
      assetId: contract.assetId,
      asset: {
        condition: { from: 'fair', to: 'good' },
        usageValue: { from: 18_400, to: 0 },
        status: { from: 'returned', to: 'available' },
      },
    });
  });

  it('keeps an asset that was reserved for someone reserved', async () => {
    const { contract, request } = await returnAt('approved');
    await db.asset.update({ where: { id: contract.assetId }, data: { status: 'reserved' } });

    await completeReturn(db, request.id, { actor });

    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      status: 'reserved',
      condition: 'good',
      usage_value: 0,
    });
  });

  it('applies the saved plan, not a recalculation', async () => {
    const { contract, request } = await returnAt('approved');
    const saved = await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } });
    const plan = JSON.parse(saved.refurbishment_plan_json ?? '{}');
    await db.returnRequest.update({
      where: { id: request.id },
      data: {
        refurbishment_plan_json: JSON.stringify({
          ...plan,
          resultingCondition: 'like_new',
          resultingUsage: 123,
        }),
      },
    });

    await completeReturn(db, request.id, { actor });

    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      condition: 'like_new',
      usage_value: 123,
    });
  });

  it.each(['requested', 'received', 'inspected', 'planned'] as const)(
    'refuses a return that is only %s',
    async (step) => {
      const { request } = await returnAt(step);

      expect(await errorCode(completeReturn(db, request.id, { actor }))).toBe(
        'RETURN_NOT_APPROVED'
      );
      expect(await db.auditLog.count({ where: { action: 'return.completed' } })).toBe(0);
    }
  );

  it('does not complete twice', async () => {
    const { request } = await returnAt('approved');
    await completeReturn(db, request.id, { actor });

    expect(await errorCode(completeReturn(db, request.id, { actor }))).toBe('RETURN_NOT_APPROVED');
  });

  it('refuses when the asset was never returned, and changes nothing', async () => {
    const { contract, request } = await returnAt('approved');
    await db.asset.update({ where: { id: contract.assetId }, data: { status: 'available' } });

    expect(await errorCode(completeReturn(db, request.id, { actor }))).toBe('ASSET_NOT_RETURNED');

    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
      'approved'
    );
    expect(await db.auditLog.count({ where: { action: 'return.completed' } })).toBe(0);
  });

  it('refuses an approved return that has no plan', async () => {
    const { request } = await returnAt('approved');
    await db.returnRequest.update({
      where: { id: request.id },
      data: { refurbishment_plan_json: null },
    });

    expect(await errorCode(completeReturn(db, request.id, { actor }))).toBe('PLAN_MISSING');
  });

  it('rejects an unknown return request', async () => {
    expect(await errorCode(completeReturn(db, 'missing', { actor }))).toBe(
      'RETURN_REQUEST_NOT_FOUND'
    );
  });
});

describe('the whole workflow', () => {
  it('lets an asset be matched after inspection and leasable after completion', async () => {
    const { contract, request } = await returnAt('inspected');

    // After inspection the asset is `returned`, the state second-life matching accepts.
    expect(await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage_value: 18_400,
    });
    expect((await db.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe(
      'ended'
    );

    await planReturn(db, request.id, { targetCondition: 'good', actor });
    await approveReturnPlan(db, request.id, { actor });
    await completeReturn(db, request.id, { actor });

    expect((await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } })).status).toBe(
      'available'
    );

    const actions = (await db.auditLog.findMany({ orderBy: { id: 'asc' } })).map((e) => e.action);

    expect(actions.filter((a) => a.startsWith('return.'))).toEqual([
      'return.requested',
      'return.received',
      'return.inspected',
      'return.planned',
      'return.approved',
      'return.completed',
    ]);
  });
});
