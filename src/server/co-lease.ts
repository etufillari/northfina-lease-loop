import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { shareProblem } from '@/domain/co-lease';
import { ApiError } from './api-response';
import { withAudit } from './audit';

/** Seeded accounts with no login, chosen so the names differ. Never a real customer's account. */
const dummyAccountIds = [0, 9, 18, 27, 36, 45, 54, 63].map((index) => `demo-user-${index}`);

export const coLeaseInputSchema = z.strictObject({
  shares: z
    .array(z.strictObject({ userId: z.string().min(1).max(80), percent: z.number() }))
    .min(1)
    .max(10),
});

export function listCoLeaseCandidates(db: PrismaClient) {
  return db.user.findMany({
    where: { id: { in: dummyAccountIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** Saves a new version of the split from today. Today's earlier version is replaced. */
export async function saveCoLeaseShares(
  db: PrismaClient,
  input: {
    customerId: string;
    userId: string;
    contractId: string;
    today: string;
    shares: { userId: string; percent: number }[];
  }
) {
  const shares = input.shares.map((share) => ({
    ...share,
    isHolder: share.userId === input.userId,
  }));
  if (shareProblem(shares))
    throw new ApiError(400, 'INVALID_SHARES', 'The shares must total exactly 100 %.');
  if (shares.some((share) => !share.isHolder && !dummyAccountIds.includes(share.userId)))
    throw new ApiError(400, 'INVALID_SHARES', 'That person cannot join this lease.');
  return withAudit(
    db,
    {
      actor: input.userId,
      action: 'lease.co_lease_changed',
      entityType: 'contract',
      entityId: input.contractId,
      details: { effectiveFrom: input.today, shares: input.shares },
    },
    async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id: input.contractId, customerId: input.customerId },
        select: { status: true, isDemo: true },
      });
      if (!contract) throw new ApiError(404, 'NOT_FOUND', 'Lease not found.');
      if (contract.status !== 'active')
        throw new ApiError(409, 'LEASE_INACTIVE', 'Only an active lease can be shared.');
      // Dummy participants must never divide a real contract's invoices.
      if (!contract.isDemo)
        throw new ApiError(409, 'REAL_LEASE', 'Real co-lessees need their own checks first.');
      const known = await tx.user.count({
        where: { id: { in: shares.map((share) => share.userId) } },
      });
      if (known !== shares.length)
        throw new ApiError(400, 'INVALID_SHARES', 'That person cannot join this lease.');
      await tx.coLeaseShare.deleteMany({
        where: { contractId: input.contractId, effectiveFrom: input.today },
      });
      await tx.coLeaseShare.createMany({
        data: shares.map((share) => ({
          ...share,
          contractId: input.contractId,
          effectiveFrom: input.today,
        })),
      });
    }
  );
}
