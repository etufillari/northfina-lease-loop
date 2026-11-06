import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';

const ACCESS_TOKEN_TTL_DAYS = 30;

export type CustomerAccess = {
  token: string;
  expiresAt: string;
  contractId: string;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function expiryFrom(createdAt: Date): Date {
  const expiresAt = new Date(createdAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + ACCESS_TOKEN_TTL_DAYS);
  return expiresAt;
}

export async function createCustomerAccess(
  db: PrismaClient,
  input: { contractId: string; actor: string; createdAt?: Date }
): Promise<CustomerAccess> {
  const contract = await db.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND', 'This contract does not exist');

  const token = randomBytes(32).toString('base64url');
  const createdAt = input.createdAt ?? new Date();
  const expiresAt = expiryFrom(createdAt);
  const id = randomUUID();

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'customer_access.created',
      entityType: 'contract',
      entityId: input.contractId,
      details: { accessId: id, expiresAt: expiresAt.toISOString() },
    },
    (tx) =>
      tx.customerAccessToken.create({
        data: {
          id,
          token_hash: hashToken(token),
          contract_id: input.contractId,
          expires_at: expiresAt,
        },
      })
  );

  return { token, expiresAt: expiresAt.toISOString(), contractId: input.contractId };
}

export async function getContractByAccessToken(db: PrismaClient, token: string) {
  const access = await db.customerAccessToken.findUnique({
    where: { token_hash: hashToken(token) },
    include: { contract: true },
  });
  if (!access || access.expires_at <= new Date()) {
    throw new ApiError(
      404,
      'ACCESS_LINK_INVALID',
      'This customer access link is invalid or expired'
    );
  }
  return access.contract;
}
