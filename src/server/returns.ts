import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
