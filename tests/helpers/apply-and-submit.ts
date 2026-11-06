// Drives an application through the real question flow to its decision, for server tests.
// It answers whatever the engine asks next from `script`, so a test states the customer's
// answers, not the order of the questions.
import type { PrismaClient } from '@/generated/prisma/client';
import { answerQuestion, startApplication, submitApplication } from '@/server/applications';

export async function applyAndSubmit(
  db: PrismaClient,
  input: {
    customerId: string;
    assetIds: string[];
    downPaymentCents: number;
    termMonths: number;
    script: Record<string, unknown>;
    asOf: string;
  }
) {
  const { script, asOf, ...deal } = input;
  const started = await startApplication(db, { ...deal, actor: input.customerId, asOf });
  if (!started.ok) throw new Error(`start: ${started.reason}`);
  const applicationId = started.state.application.id;
  let next = started.state.nextQuestionId;
  while (next !== null) {
    if (!(next in script)) throw new Error(`no scripted answer for ${next}`);
    const result = await answerQuestion(db, {
      applicationId,
      questionId: next,
      answer: script[next] as never,
      actor: input.customerId,
      asOf,
    });
    if (!result.ok) throw new Error(`answer ${next}: ${result.reason}`);
    next = result.state.nextQuestionId;
  }
  const submitted = await submitApplication(db, {
    applicationId,
    startDate: asOf,
    actor: input.customerId,
    asOf,
  });
  if (!submitted.ok) throw new Error(`submit: ${submitted.reason}`);
  return submitted.state;
}

/** Aino's answers (scenario card 1): an employed consumer, approved automatically. */
export const ainoScript = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};
