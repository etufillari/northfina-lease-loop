import { ApiError } from './api-response';
import type { TransactionClient } from './audit';
import type { PrismaClient } from './prisma-client';
import { answersSchema } from './spine-shapes';

/** A saved handoff belongs to the offer, not to a later editable form submission. */
export async function requireNoPendingSignature(
  db: PrismaClient | TransactionClient,
  quoteId: string
): Promise<void> {
  const applications = await db.application.findMany({
    where: { quote_id: quoteId, decision: 'manual_review' },
    select: { answers_json: true },
  });
  for (const application of applications) {
    const answers = answersSchema.parse(JSON.parse(application.answers_json));
    if (answers.q_can_sign === 'no') {
      throw new ApiError(
        409,
        'SIGNATURE_HANDOFF_PENDING',
        'This offer is waiting for its named signatory'
      );
    }
  }
}
