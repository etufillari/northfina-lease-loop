import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { assetConditionSchema, assetSchema } from '@/data/schemas';
import { loadRefurbishmentCosts } from '@/data/load';
import { calculateRefurbishment } from '@/domain/refurbishment';

import { toAsset } from './assets';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { refusal } from './pricing-data';
import type { PrismaClient } from './prisma-client';

const createReturnRequestSchema = z.strictObject({
  contractId: z.string().min(1),
  customerId: z.string().min(1),
  expectedReturnDate: z.iso.date().optional(),
  actor: z.string().min(1),
});

export type CreateReturnRequestInput = z.infer<typeof createReturnRequestSchema>;

// Physical receipt only. Inspection details are recorded separately.
export const markReturnReceivedSchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export type MarkReturnReceivedInput = z.infer<typeof markReturnReceivedSchema>;

// Dealer inspection details.
export const inspectReturnSchema = z.strictObject({
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative(),
  usageSinceLastService: z.number().int().nonnegative().optional(),
  actor: z.string().trim().min(1).max(100),
});

export type InspectReturnInput = z.infer<typeof inspectReturnSchema>;

export const planReturnSchema = z.strictObject({
  targetCondition: assetConditionSchema,
  actor: z.string().trim().min(1).max(100),
});

export type PlanReturnInput = z.infer<typeof planReturnSchema>;

const OPEN_STATUSES = ['requested', 'received', 'inspected', 'planned', 'approved'];

const CONDITION_ORDER = ['poor', 'fair', 'good', 'like_new', 'new'];

// Customer creates a return request.
export async function createReturnRequest(db: PrismaClient, input: CreateReturnRequestInput) {
  const request = createReturnRequestSchema.parse(input);

  const contract = await db.contract.findUnique({
    where: { id: request.contractId },
    include: { asset: true },
  });

  if (!contract) {
    throw refusal('contract_not_found');
  }

  if (contract.customer_id !== request.customerId) {
    throw new ApiError(
      403,
      'CUSTOMER_CONTRACT_MISMATCH',
      'This contract does not belong to the supplied customer.'
    );
  }

  if (contract.status !== 'active') {
    throw new ApiError(
      409,
      'CONTRACT_NOT_ACTIVE',
      'A return can only be requested for an active contract.'
    );
  }

  if (contract.asset.status !== 'reserved') {
    throw new ApiError(
      409,
      'ASSET_NOT_ON_ACTIVE_LEASE',
      'The asset is not currently reserved by an active lease.'
    );
  }

  const id = randomUUID();

  return withAudit(
    db,
    {
      actor: request.actor,
      action: 'return.requested',
      entityType: 'return_request',
      entityId: id,
      details: {
        assetId: contract.asset.id,
        contractId: contract.id,
        customerId: request.customerId,
        expectedReturnDate: request.expectedReturnDate ?? null,
      },
    },
    async (tx) => {
      const existing = await tx.returnRequest.findFirst({
        where: {
          contract_id: contract.id,
          status: { in: OPEN_STATUSES },
        },
      });

      if (existing) {
        throw new ApiError(
          409,
          'RETURN_REQUEST_ALREADY_OPEN',
          'An open return request already exists for this contract.'
        );
      }

      return tx.returnRequest.create({
        data: {
          id,
          asset_id: contract.asset.id,
          contract_id: contract.id,
          customer_id: request.customerId,
          status: 'requested',
          expected_return_date: request.expectedReturnDate,
        },
      });
    }
  );
}

/**
 * Dealer confirms that the physical item has arrived.
 *
 * This operation does not record inspection details.
 * The item remains unchanged in the Asset table.
 *
 * Transition: requested -> received
 */
export async function markReturnReceived(
  db: PrismaClient,
  returnRequestId: string,
  input: MarkReturnReceivedInput
) {
  const receipt = markReturnReceivedSchema.parse(input);

  const existing = await db.returnRequest.findUnique({
    where: { id: returnRequestId },
  });

  if (!existing) {
    throw new ApiError(404, 'RETURN_REQUEST_NOT_FOUND', 'This return request does not exist.');
  }

  if (existing.status !== 'requested') {
    throw new ApiError(
      409,
      'RETURN_REQUEST_NOT_REQUESTED',
      'Only a requested return can be marked as received.'
    );
  }

  return withAudit(
    db,
    {
      actor: receipt.actor,
      action: 'return.received',
      entityType: 'return_request',
      entityId: returnRequestId,
      details: {
        assetId: existing.asset_id,
      },
    },
    async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: {
          id: returnRequestId,
          status: 'requested',
        },
        data: {
          status: 'received',
          received_at: new Date(),
          received_by: receipt.actor,
        },
      });

      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'RETURN_REQUEST_NOT_REQUESTED',
          'Only a requested return can be marked as received.'
        );
      }

      return tx.returnRequest.findUniqueOrThrow({
        where: { id: returnRequestId },
      });
    }
  );
}

/**
 * Dealer records the inspection after physical receipt.
 *
 * Inspection data is saved on ReturnRequest, not on Asset.
 *
 * Transition: received -> inspected
 */
export async function inspectReturn(
  db: PrismaClient,
  returnRequestId: string,
  input: InspectReturnInput
) {
  const inspection = inspectReturnSchema.parse(input);

  const existing = await db.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: { asset: true },
  });

  if (!existing) {
    throw new ApiError(404, 'RETURN_REQUEST_NOT_FOUND', 'This return request does not exist.');
  }

  if (existing.status !== 'received') {
    throw new ApiError(
      409,
      'RETURN_NOT_RECEIVED',
      'Only a physically received return can be inspected.'
    );
  }

  if (
    existing.asset.category === 'farm_machine' &&
    inspection.usageSinceLastService === undefined
  ) {
    throw new ApiError(
      422,
      'MISSING_SERVICE_HISTORY',
      'Farm machine inspections must include usage since the last service.'
    );
  }

  return withAudit(
    db,
    {
      actor: inspection.actor,
      action: 'return.inspected',
      entityType: 'return_request',
      entityId: returnRequestId,
      details: {
        assetId: existing.asset_id,
        condition: inspection.condition,
        usageUnit: existing.asset.usage_unit,
        usageValue: inspection.usageValue,
        usageSinceLastService: inspection.usageSinceLastService ?? null,
      },
    },
    async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: {
          id: returnRequestId,
          status: 'received',
        },
        data: {
          status: 'inspected',
          inspected_at: new Date(),
          inspected_by: inspection.actor,
          inspected_condition: inspection.condition,
          inspected_usage_unit: existing.asset.usage_unit,
          inspected_usage_value: inspection.usageValue,
          usage_since_last_service: inspection.usageSinceLastService ?? null,
        },
      });

      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'RETURN_NOT_RECEIVED',
          'Only a physically received return can be inspected.'
        );
      }

      return tx.returnRequest.findUniqueOrThrow({
        where: { id: returnRequestId },
      });
    }
  );
}

/**
 * Calculates and saves a refurbishment plan using the dealer's inspection.
 *
 * The asset itself is not updated until refurbishment is completed.
 *
 * Transition: inspected -> planned
 */
export async function planReturn(
  db: PrismaClient,
  returnRequestId: string,
  input: PlanReturnInput
) {
  const request = planReturnSchema.parse(input);

  const existing = await db.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: { asset: true },
  });

  if (!existing) {
    throw new ApiError(404, 'RETURN_REQUEST_NOT_FOUND', 'This return request does not exist.');
  }

  if (existing.status !== 'inspected') {
    throw new ApiError(
      409,
      'RETURN_NOT_INSPECTED',
      'Only an inspected return can be planned for refurbishment.'
    );
  }

  if (
    existing.inspected_condition === null ||
    existing.inspected_usage_unit === null ||
    existing.inspected_usage_value === null
  ) {
    throw new ApiError(
      409,
      'INSPECTION_INCOMPLETE',
      'The return request does not have a complete inspection.'
    );
  }

  const inspectedCondition = assetConditionSchema.parse(existing.inspected_condition);

  const currentConditionIndex = CONDITION_ORDER.indexOf(inspectedCondition);

  const targetConditionIndex = CONDITION_ORDER.indexOf(request.targetCondition);

  if (currentConditionIndex === -1 || targetConditionIndex < currentConditionIndex) {
    throw new ApiError(
      422,
      'INVALID_TARGET_CONDITION',
      'The refurbishment target cannot be worse than the inspected condition.'
    );
  }

  // Build a domain asset from the original asset plus the latest inspection.
  const inspectedAsset = assetSchema.parse({
    ...toAsset(existing.asset),
    condition: inspectedCondition,
    usage: {
      unit: existing.inspected_usage_unit,
      value: existing.inspected_usage_value,
    },
  });

  const costs = await loadRefurbishmentCosts();

  const calculation = calculateRefurbishment({
    asset: inspectedAsset,
    costs,
    targetCondition: request.targetCondition,
    usageSinceLastService: existing.usage_since_last_service ?? undefined,
  });

  if (!calculation.ok) {
    if (calculation.reason === 'missing_service_history') {
      throw new ApiError(
        422,
        'MISSING_SERVICE_HISTORY',
        'Farm machine service history is required to calculate refurbishment costs.'
      );
    }

    throw new ApiError(
      422,
      'MISSING_REFURBISHMENT_COST_RULE',
      'A refurbishment cost rule is missing for this plan.'
    );
  }

  const plan = {
    targetCondition: request.targetCondition,
    inspectedCondition,
    actions: calculation.actions,
    totalCostCents: calculation.totalCostCents,
    resultingCondition: calculation.resultingCondition,
    inspectedUsage: inspectedAsset.usage,
    resultingUsage: calculation.resultingUsage,
    usageReset: calculation.usageReset,
  };

  return withAudit(
    db,
    {
      actor: request.actor,
      action: 'return.planned',
      entityType: 'return_request',
      entityId: returnRequestId,
      details: {
        assetId: existing.asset_id,
        targetCondition: request.targetCondition,
        totalCostCents: calculation.totalCostCents,
        resultingCondition: calculation.resultingCondition,
        actions: calculation.actions,
      },
    },
    async (tx) => {
      const claimed = await tx.returnRequest.updateMany({
        where: {
          id: returnRequestId,
          status: 'inspected',
        },
        data: {
          status: 'planned',
          target_condition: request.targetCondition,
          refurbishment_plan_json: JSON.stringify(plan),
          refurbishment_total_cost_cents: calculation.totalCostCents,
          resulting_condition: calculation.resultingCondition,
          resulting_usage_unit: inspectedAsset.usage.unit,
          resulting_usage_value: calculation.resultingUsage,
        },
      });

      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'RETURN_NOT_INSPECTED',
          'Only an inspected return can be planned for refurbishment.'
        );
      }

      return tx.returnRequest.findUniqueOrThrow({
        where: { id: returnRequestId },
      });
    }
  );
}
