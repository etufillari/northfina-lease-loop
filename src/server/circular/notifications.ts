import type { PrismaClient } from '@/generated/prisma/client';
/** Outstanding customer handovers, not imported examples or already received items. */
export async function pendingReturnNotifications(db: PrismaClient) {
  const returns = await db.assetReturn.findMany({
    where: { status: 'REQUESTED', leaseId: { not: null } },
    select: { id: true, assetId: true, requestedOn: true },
    orderBy: [{ requestedOn: 'asc' }, { id: 'asc' }],
  });
  return { count: returns.length, returns };
}
