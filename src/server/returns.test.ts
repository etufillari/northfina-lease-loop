import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { ApiError } from './api-response';
import { seedAssets } from './assets';
import { signContract } from './contracts';
import { loadPricingData, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';
import { createQuote } from './quotes';
import { createReturnRequest, markReturnReceived, inspectReturn, planReturn } from './returns';

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

function getErrorCode(promise: Promise<unknown>) {
  return promise.then(
    () => 'NO_ERROR',
    (error: unknown) => (error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR')
  );
}

async function createActiveContract(assetId = 'ebike-003') {
  const quote = await createQuote(db, pricing, {
    assetId,
    termMonths: 36,
    onDate: '2026-11-05',
    downPaymentCents: 0,
    actor: 'test',
  });

  return signContract(db, pricing, {
    quoteId: quote.id,
    customerId,
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    accepted: quote,
    actor: 'test',
  });
}

async function createReturnForAsset(assetId = 'ebike-003') {
  const contract = await createActiveContract(assetId);

  const returnRequest = await createReturnRequest(db, {
    contractId: contract.id,
    customerId,
    expectedReturnDate: '2026-11-10',
    actor: customerId,
  });

  return { contract, returnRequest };
}

async function receiveAndInspect(
  returnRequestId: string,
  options?: {
    condition?: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
    usageValue?: number;
    usageSinceLastService?: number;
  }
) {
  await markReturnReceived(db, returnRequestId, {
    actor,
  });

  return inspectReturn(db, returnRequestId, {
    condition: options?.condition ?? 'fair',
    usageValue: options?.usageValue ?? 100,
    usageSinceLastService: options?.usageSinceLastService,
    actor,
  });
}

describe('createReturnRequest', () => {
  it('creates a return request without changing the asset status', async () => {
    const contract = await createActiveContract();

    const result = await createReturnRequest(db, {
      contractId: contract.id,
      customerId,
      expectedReturnDate: '2026-11-10',
      actor: customerId,
    });

    expect(result).toMatchObject({
      contract_id: contract.id,
      customer_id: customerId,
      status: 'requested',
      expected_return_date: '2026-11-10',
    });

    const asset = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    expect(asset.status).toBe('reserved');

    expect(
      await db.auditLog.findFirst({
        where: {
          action: 'return.requested',
          entity_id: result.id,
        },
      })
    ).toMatchObject({
      actor: customerId,
      action: 'return.requested',
      entity_type: 'return_request',
      entity_id: result.id,
    });
  });

  it('rejects a missing contract', async () => {
    expect(
      await getErrorCode(
        createReturnRequest(db, {
          contractId: 'missing-contract',
          customerId,
          actor: customerId,
        })
      )
    ).toBe('CONTRACT_NOT_FOUND');
  });

  it('rejects a customer who does not own the contract', async () => {
    const contract = await createActiveContract();

    expect(
      await getErrorCode(
        createReturnRequest(db, {
          contractId: contract.id,
          customerId: 'another-customer',
          actor: customerId,
        })
      )
    ).toBe('CUSTOMER_CONTRACT_MISMATCH');
  });

  it('rejects a contract that is not active', async () => {
    const contract = await createActiveContract();

    await db.contract.update({
      where: { id: contract.id },
      data: { status: 'cancelled' },
    });

    expect(
      await getErrorCode(
        createReturnRequest(db, {
          contractId: contract.id,
          customerId,
          actor: customerId,
        })
      )
    ).toBe('CONTRACT_NOT_ACTIVE');
  });

  it('rejects an asset that is not reserved', async () => {
    const contract = await createActiveContract();

    await db.asset.update({
      where: { id: contract.assetId },
      data: { status: 'available' },
    });

    expect(
      await getErrorCode(
        createReturnRequest(db, {
          contractId: contract.id,
          customerId,
          actor: customerId,
        })
      )
    ).toBe('ASSET_NOT_ON_ACTIVE_LEASE');
  });

  it('rejects a second open return request for the same contract', async () => {
    const contract = await createActiveContract();

    const input = {
      contractId: contract.id,
      customerId,
      actor: customerId,
    };

    const first = await createReturnRequest(db, input);

    expect(await getErrorCode(createReturnRequest(db, input))).toBe('RETURN_REQUEST_ALREADY_OPEN');

    expect(
      await db.returnRequest.count({
        where: { contract_id: contract.id },
      })
    ).toBe(1);

    expect(
      await db.auditLog.count({
        where: {
          action: 'return.requested',
          entity_id: first.id,
        },
      })
    ).toBe(1);
  });

  it('allows a new request after the previous request was cancelled', async () => {
    const contract = await createActiveContract();

    const input = {
      contractId: contract.id,
      customerId,
      actor: customerId,
    };

    const first = await createReturnRequest(db, input);

    await db.returnRequest.update({
      where: { id: first.id },
      data: { status: 'cancelled' },
    });

    const second = await createReturnRequest(db, input);

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('requested');
  });

  it('rejects invalid input without creating a request or audit entry', async () => {
    const contract = await createActiveContract();

    const auditCountBefore = await db.auditLog.count();

    await expect(
      createReturnRequest(db, {
        contractId: contract.id,
        customerId,
        expectedReturnDate: 'not-a-date',
        actor: customerId,
      })
    ).rejects.toThrow();

    expect(await db.returnRequest.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(auditCountBefore);
  });
});

describe('markReturnReceived', () => {
  it('records physical receipt without recording inspection details', async () => {
    const { contract, returnRequest } = await createReturnForAsset();

    const assetBefore = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    const result = await markReturnReceived(db, returnRequest.id, { actor });

    expect(result).toMatchObject({
      id: returnRequest.id,
      status: 'received',
      received_by: actor,
      inspected_at: null,
      inspected_by: null,
      inspected_condition: null,
      inspected_usage_unit: null,
      inspected_usage_value: null,
      usage_since_last_service: null,
    });

    expect(result.received_at).toBeInstanceOf(Date);

    const assetAfter = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    expect(assetAfter.status).toBe(assetBefore.status);
    expect(assetAfter.condition).toBe(assetBefore.condition);
    expect(assetAfter.usage_value).toBe(assetBefore.usage_value);

    expect(
      await db.auditLog.findFirst({
        where: {
          action: 'return.received',
          entity_id: returnRequest.id,
        },
      })
    ).toMatchObject({
      actor,
      action: 'return.received',
      entity_type: 'return_request',
      entity_id: returnRequest.id,
    });
  });

  it('rejects an unknown return request', async () => {
    expect(await getErrorCode(markReturnReceived(db, 'missing-request', { actor }))).toBe(
      'RETURN_REQUEST_NOT_FOUND'
    );
  });

  it('does not allow the same return request to be received twice', async () => {
    const { returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });

    expect(await getErrorCode(markReturnReceived(db, returnRequest.id, { actor }))).toBe(
      'RETURN_REQUEST_NOT_REQUESTED'
    );

    expect(
      await db.auditLog.count({
        where: {
          action: 'return.received',
          entity_id: returnRequest.id,
        },
      })
    ).toBe(1);
  });

  it('does not accept inspection fields in the receipt input', async () => {
    const { returnRequest } = await createReturnForAsset();

    await expect(
      markReturnReceived(db, returnRequest.id, {
        actor,
        condition: 'fair',
        usageValue: 100,
      } as never)
    ).rejects.toThrow();

    const unchanged = await db.returnRequest.findUniqueOrThrow({
      where: { id: returnRequest.id },
    });

    expect(unchanged.status).toBe('requested');
    expect(unchanged.received_at).toBeNull();
  });
});

describe('inspectReturn', () => {
  it('records inspection details after physical receipt', async () => {
    const { contract, returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });

    const assetBefore = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    const result = await inspectReturn(db, returnRequest.id, {
      condition: 'fair',
      usageValue: 18_400,
      actor,
    });

    expect(result).toMatchObject({
      id: returnRequest.id,
      status: 'inspected',
      received_by: actor,
      inspected_by: actor,
      inspected_condition: 'fair',
      inspected_usage_unit: 'km',
      inspected_usage_value: 18_400,
      usage_since_last_service: null,
    });

    expect(result.received_at).toBeInstanceOf(Date);
    expect(result.inspected_at).toBeInstanceOf(Date);

    // The lease ends with the inspection: the asset takes the inspected values and is returned.
    const assetAfter = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    expect(assetBefore.status).toBe('reserved');
    expect(assetAfter).toMatchObject({
      status: 'returned',
      condition: 'fair',
      usage_value: 18_400,
      previous_lives: assetBefore.previous_lives + 1,
    });

    const endedContract = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });

    expect(endedContract.status).toBe('ended');

    const audit = await db.auditLog.findFirst({
      where: {
        action: 'return.inspected',
        entity_id: returnRequest.id,
      },
    });

    expect(audit).toMatchObject({
      actor,
      action: 'return.inspected',
      entity_type: 'return_request',
      entity_id: returnRequest.id,
    });
    expect(JSON.parse(audit?.details_json ?? '{}')).toMatchObject({
      asset: {
        condition: { from: assetBefore.condition, to: 'fair' },
        usageValue: { from: assetBefore.usage_value, to: 18_400 },
        status: { from: 'reserved', to: 'returned' },
        previousLives: {
          from: assetBefore.previous_lives,
          to: assetBefore.previous_lives + 1,
        },
      },
      contract: { id: contract.id, status: { from: 'active', to: 'ended' } },
    });
  });

  it('rolls the inspection back when the contract is no longer active', async () => {
    const { contract, returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });
    await db.contract.update({ where: { id: contract.id }, data: { status: 'ended' } });

    expect(
      await getErrorCode(
        inspectReturn(db, returnRequest.id, { condition: 'fair', usageValue: 100, actor })
      )
    ).toBe('CONTRACT_NOT_ACTIVE');

    const unchanged = await db.returnRequest.findUniqueOrThrow({ where: { id: returnRequest.id } });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: contract.assetId } });

    expect(unchanged.status).toBe('received');
    expect(unchanged.inspected_at).toBeNull();
    expect(asset.status).toBe('reserved');
    expect(asset.previous_lives).toBe(0);
  });

  it('rolls the inspection back when the asset is not on an active lease', async () => {
    const { contract, returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });
    await db.asset.update({ where: { id: contract.assetId }, data: { status: 'available' } });

    expect(
      await getErrorCode(
        inspectReturn(db, returnRequest.id, { condition: 'fair', usageValue: 100, actor })
      )
    ).toBe('ASSET_NOT_ON_ACTIVE_LEASE');

    const unchanged = await db.returnRequest.findUniqueOrThrow({ where: { id: returnRequest.id } });

    expect(unchanged.status).toBe('received');
    expect(await db.auditLog.count({ where: { action: 'return.inspected' } })).toBe(0);
  });

  it('rejects inspection before physical receipt', async () => {
    const { returnRequest } = await createReturnForAsset();

    expect(
      await getErrorCode(
        inspectReturn(db, returnRequest.id, {
          condition: 'good',
          usageValue: 100,
          actor,
        })
      )
    ).toBe('RETURN_NOT_RECEIVED');

    const unchanged = await db.returnRequest.findUniqueOrThrow({
      where: { id: returnRequest.id },
    });

    expect(unchanged.status).toBe('requested');
    expect(unchanged.inspected_condition).toBeNull();
  });

  it('rejects an unknown return request', async () => {
    expect(
      await getErrorCode(
        inspectReturn(db, 'missing-request', {
          condition: 'good',
          usageValue: 100,
          actor,
        })
      )
    ).toBe('RETURN_REQUEST_NOT_FOUND');
  });

  it('requires service history when inspecting a farm machine', async () => {
    const { returnRequest } = await createReturnForAsset('farm-002');

    await markReturnReceived(db, returnRequest.id, { actor });

    expect(
      await getErrorCode(
        inspectReturn(db, returnRequest.id, {
          condition: 'good',
          usageValue: 4_200,
          actor,
        })
      )
    ).toBe('MISSING_SERVICE_HISTORY');

    const unchanged = await db.returnRequest.findUniqueOrThrow({
      where: { id: returnRequest.id },
    });

    expect(unchanged.status).toBe('received');
    expect(unchanged.inspected_condition).toBeNull();
    expect(unchanged.inspected_at).toBeNull();

    expect(
      await db.auditLog.count({
        where: {
          action: 'return.inspected',
          entity_id: returnRequest.id,
        },
      })
    ).toBe(0);
  });

  it('stores farm machine usage since its last service', async () => {
    const { returnRequest } = await createReturnForAsset('farm-002');

    await markReturnReceived(db, returnRequest.id, { actor });

    const result = await inspectReturn(db, returnRequest.id, {
      condition: 'good',
      usageValue: 4_200,
      usageSinceLastService: 350,
      actor,
    });

    expect(result).toMatchObject({
      status: 'inspected',
      inspected_usage_unit: 'engine_hours',
      inspected_usage_value: 4_200,
      usage_since_last_service: 350,
    });
  });

  it('rejects negative usage values', async () => {
    const { returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });

    await expect(
      inspectReturn(db, returnRequest.id, {
        condition: 'good',
        usageValue: -1,
        actor,
      })
    ).rejects.toThrow();

    const unchanged = await db.returnRequest.findUniqueOrThrow({
      where: { id: returnRequest.id },
    });

    expect(unchanged.status).toBe('received');
    expect(unchanged.inspected_usage_value).toBeNull();
  });

  it('does not allow the same return request to be inspected twice', async () => {
    const { returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });

    const input = {
      condition: 'good' as const,
      usageValue: 100,
      actor,
    };

    await inspectReturn(db, returnRequest.id, input);

    expect(await getErrorCode(inspectReturn(db, returnRequest.id, input))).toBe(
      'RETURN_NOT_RECEIVED'
    );

    expect(
      await db.auditLog.count({
        where: {
          action: 'return.inspected',
          entity_id: returnRequest.id,
        },
      })
    ).toBe(1);
  });
});

describe('planReturn', () => {
  it('creates and saves a refurbishment plan from dealer inspection', async () => {
    const { contract, returnRequest } = await createReturnForAsset();

    await receiveAndInspect(returnRequest.id, {
      condition: 'fair',
      usageValue: 18_400,
    });

    const result = await planReturn(db, returnRequest.id, {
      targetCondition: 'good',
      actor,
    });

    expect(result).toMatchObject({
      id: returnRequest.id,
      status: 'planned',
      target_condition: 'good',
      resulting_condition: 'good',
      resulting_usage_unit: 'km',
      resulting_usage_value: 0,
    });

    expect(result.refurbishment_total_cost_cents).toBeGreaterThan(0);
    expect(result.refurbishment_plan_json).toBeTruthy();

    const savedPlan = JSON.parse(result.refurbishment_plan_json!);

    expect(savedPlan).toMatchObject({
      targetCondition: 'good',
      inspectedCondition: 'fair',
      resultingCondition: 'good',
      usageReset: true,
    });

    expect(savedPlan.actions.length).toBeGreaterThan(0);

    // Planning leaves the asset as the inspection set it: returned, not yet refurbished.
    const asset = await db.asset.findUniqueOrThrow({
      where: { id: contract.assetId },
    });

    expect(asset).toMatchObject({ status: 'returned', condition: 'fair', usage_value: 18_400 });
  });

  it('rejects planning before inspection', async () => {
    const { returnRequest } = await createReturnForAsset();

    expect(
      await getErrorCode(
        planReturn(db, returnRequest.id, {
          targetCondition: 'good',
          actor,
        })
      )
    ).toBe('RETURN_NOT_INSPECTED');
  });

  it('rejects planning after receipt but before inspection', async () => {
    const { returnRequest } = await createReturnForAsset();

    await markReturnReceived(db, returnRequest.id, { actor });

    expect(
      await getErrorCode(
        planReturn(db, returnRequest.id, {
          targetCondition: 'good',
          actor,
        })
      )
    ).toBe('RETURN_NOT_INSPECTED');
  });

  it('rejects a target condition worse than the inspection', async () => {
    const { returnRequest } = await createReturnForAsset();

    await receiveAndInspect(returnRequest.id, {
      condition: 'good',
      usageValue: 100,
    });

    expect(
      await getErrorCode(
        planReturn(db, returnRequest.id, {
          targetCondition: 'fair',
          actor,
        })
      )
    ).toBe('INVALID_TARGET_CONDITION');
  });

  it('does not allow a return to be planned twice', async () => {
    const { returnRequest } = await createReturnForAsset();

    await receiveAndInspect(returnRequest.id, {
      condition: 'fair',
      usageValue: 100,
    });

    const input = {
      targetCondition: 'good' as const,
      actor,
    };

    await planReturn(db, returnRequest.id, input);

    expect(await getErrorCode(planReturn(db, returnRequest.id, input))).toBe(
      'RETURN_NOT_INSPECTED'
    );

    expect(
      await db.auditLog.count({
        where: {
          action: 'return.planned',
          entity_id: returnRequest.id,
        },
      })
    ).toBe(1);
  });

  it('uses recorded farm-machine service history for planning', async () => {
    const { returnRequest } = await createReturnForAsset('farm-002');

    await receiveAndInspect(returnRequest.id, {
      condition: 'fair',
      usageValue: 4_200,
      usageSinceLastService: 350,
    });

    const result = await planReturn(db, returnRequest.id, {
      targetCondition: 'good',
      actor,
    });

    expect(result.status).toBe('planned');
    expect(result.refurbishment_total_cost_cents).toBeGreaterThan(0);

    const savedPlan = JSON.parse(result.refurbishment_plan_json!);

    expect(savedPlan.targetCondition).toBe('good');
    expect(savedPlan.resultingCondition).toBe('good');
  });
});
