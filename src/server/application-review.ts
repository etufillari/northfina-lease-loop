// #19 / scenario card 7: applications that end in "a person needs to review" (large amounts, PEP)
// wait in a staff queue. Staff approve or reject with a note; the customer then sees the result
// on their application page and, once approved, can continue to signing. Audited.
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { ApiError } from './api-response';
import { applicationItemsSchema } from './applications';
import { withAudit } from './audit';

export const reviewDecisionSchema = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().min(3).max(500),
});

/** Applications waiting for a person, oldest first, with what staff need to decide. */
export async function listReviewApplications(db: PrismaClient) {
  const rows = await db.leaseApplication.findMany({
    where: { status: 'manual_review' },
    orderBy: { createdAt: 'asc' },
    include: { customer: { include: { owner: { select: { name: true } } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer.owner.name,
    startDate: row.startDate,
    reasons: z.array(z.string()).parse(JSON.parse(row.reasonsJson)),
    items: applicationItemsSchema.parse(JSON.parse(row.itemsJson)),
  }));
}

/** Records a staff decision on an application waiting for review. */
export async function reviewApplication(
  db: PrismaClient,
  input: { id: string; staffId: string; decision: 'approve' | 'reject'; note: string }
) {
  const to = input.decision === 'approve' ? 'approved' : 'rejected';
  return withAudit(
    db,
    {
      actor: input.staffId,
      action: 'application.reviewed',
      entityType: 'application',
      entityId: input.id,
      details: { from: 'manual_review', to, note: input.note },
    },
    async (tx) => {
      // Only one decision: a second reviewer (or a retry) can't overwrite the first.
      const updated = await tx.leaseApplication.updateMany({
        where: { id: input.id, status: 'manual_review' },
        data: { status: to },
      });
      if (!updated.count)
        throw new ApiError(409, 'NOT_IN_REVIEW', 'This application is not waiting for review.');
      return { id: input.id, status: to };
    }
  );
}
