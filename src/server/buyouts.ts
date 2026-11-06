import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';

const createBuyoutRequestSchema = z.strictObject({
  contractId: z.string().min(1),
  customerId: z.string().min(1),
  actor: z.string().min(1),
});

export type CreateBuyoutRequestInput = z.infer<typeof createBuyoutRequestSchema>;

const OPEN_STATUSES = ['requested', 'approved'];

export async function createBuyoutRequest(db: PrismaClient, input: CreateBuyoutRequestInput) {
  const request = createBuyoutRequestSchema.parse(input);
  const contract = await db.contract.findUnique({ where: { id: request.contractId } });

  if (!contract) {
    throw new ApiError(404, 'CONTRACT_NOT_FOUND', 'This contract does not exist.');
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
      'A buyout can only be requested for an active contract.'
    );
  }
  const id = randomUUID();
  return withAudit(
    db,
    {
      actor: request.actor,
      action: 'buyout.requested',
      entityType: 'buyout_request',
      entityId: id,
      details: {
        contractId: contract.id,
        customerId: request.customerId,
        buyoutNetCents: contract.buyout_net_cents,
        settlementDueAfter: contract.end_date,
      },
    },
    async (tx) => {
      const existing = await tx.buyoutRequest.findFirst({
        where: {
          contract_id: contract.id,
          status: { in: OPEN_STATUSES },
        },
      });
      if (existing) {
        throw new ApiError(
          409,
          'BUYOUT_REQUEST_ALREADY_OPEN',
          'An open buyout request already exists for this contract.'
        );
      }

      return tx.buyoutRequest.create({
        data: {
          id,
          contract_id: contract.id,
          customer_id: contract.customer_id,
          buyout_net_cents: contract.buyout_net_cents,
          settlement_due_after: contract.end_date,
          status: 'requested',
        },
      });
    }
  );
}
