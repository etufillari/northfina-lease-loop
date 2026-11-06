import { randomUUID } from 'node:crypto';
import { assetCategorySchema } from '@/data/schemas';
import {
  evaluateCollectedApplication,
  type ApplicationEvaluationContext,
} from '@/domain/application-result';
import type { ApplicationDecision } from '@/domain/application';
import type { ApplicationAnswers } from '@/domain/question-flow';
import { withAudit } from './audit';
import type { PrismaClient } from './prisma-client';

export type SubmitApplicationRequest = ApplicationEvaluationContext & {
  answers: ApplicationAnswers;
  category: string;
  quoteId?: string;
  customerId?: string;
  actor: string;
};

export type SubmittedApplication = {
  id: string;
  quoteId: string | null;
  customerId: string | null;
  category: string;
  financedAmountCents: number;
  contractStartDate: string;
  decision: ApplicationDecision['decision'];
  reasons: ApplicationDecision['reasons'];
  answers: ApplicationAnswers;
  decisionResult: ApplicationDecision;
};

export async function submitApplication(
  db: PrismaClient,
  request: SubmitApplicationRequest
): Promise<SubmittedApplication> {
  const category = assetCategorySchema.parse(request.category);
  const decision = evaluateCollectedApplication(request.answers, {
    contractStartDate: request.contractStartDate,
    financedAmountCents: request.financedAmountCents,
    monthlyRentWithVatCents: request.monthlyRentWithVatCents,
  });
  const id = randomUUID();
  const application = {
    id,
    quoteId: request.quoteId ?? null,
    customerId: request.customerId ?? null,
    category,
    financedAmountCents: request.financedAmountCents,
    contractStartDate: request.contractStartDate,
    decision: decision.decision,
    reasons: decision.reasons,
    answers: request.answers,
    decisionResult: decision,
  } satisfies SubmittedApplication;

  await withAudit(
    db,
    {
      actor: request.actor,
      action: 'application.submitted',
      entityType: 'application',
      entityId: id,
      details: {
        quoteId: application.quoteId,
        customerId: application.customerId,
        category: application.category,
        financedAmountCents: application.financedAmountCents,
        decision: application.decision,
        reasons: application.reasons,
      },
    },
    (tx) =>
      tx.application.create({
        data: {
          id: application.id,
          quote_id: application.quoteId,
          customer_id: application.customerId,
          category: application.category,
          financed_cents: application.financedAmountCents,
          contract_start_date: application.contractStartDate,
          decision: application.decision,
          reasons_json: JSON.stringify(application.reasons),
          answers_json: JSON.stringify(application.answers),
        },
      })
  );

  return application;
}
