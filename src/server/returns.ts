import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
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

const receiveReturnSchema = z.strictObject({
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative(),
  usageSinceLastService: z.number().int().nonnegative().optional(),
  actor: z.string().trim().min(1).max(100),
});

export type ReceiveReturnInput = z.infer<typeof receiveReturnSchema>;

const OPEN_STATUSES = ['requested', 'received', 'planned', 'approved'];

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
 * Records the dealer's physical inspection.
 * The asset itself is deliberately not updated here.
 */
export async function receiveReturn(
  db: PrismaClient,
  returnRequestId: string,
  input: ReceiveReturnInput
) {
  const inspection = receiveReturnSchema.parse(input);

  const existing = await db.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: { asset: true },
  });

  if (!existing) {
    throw new ApiError(404, 'RETURN_REQUEST_NOT_FOUND', 'This return request does not exist.');
  }

  if (existing.status !== 'requested') {
    throw new ApiError(
      409,
      'RETURN_REQUEST_NOT_REQUESTED',
      'Only a requested return can be received and inspected.'
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
      action: 'return.received',
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
      // Conditional transition prevents two dealers receiving the same request.
      const claimed = await tx.returnRequest.updateMany({
        where: {
          id: returnRequestId,
          status: 'requested',
        },
        data: {
          status: 'received',
          received_at: new Date(),
          received_by: inspection.actor,
          inspected_condition: inspection.condition,
          inspected_usage_unit: existing.asset.usage_unit,
          inspected_usage_value: inspection.usageValue,
          usage_since_last_service: inspection.usageSinceLastService ?? null,
        },
      });

      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          'RETURN_REQUEST_NOT_REQUESTED',
          'Only a requested return can be received and inspected.'
        );
      }

      return tx.returnRequest.findUniqueOrThrow({
        where: { id: returnRequestId },
      });
    }
  );
}
