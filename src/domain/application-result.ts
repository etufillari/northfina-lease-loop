import { evaluateApplication, type ApplicationDecision } from './application';
import type { ApplicationAnswers } from './question-flow';

export type ApplicationEvaluationContext = {
  contractStartDate: string;
  financedAmountCents: number;
  monthlyRentWithVatCents?: number;
};

/**
 * Converts the data-driven question answers into the eligibility evaluator's input.
 * The application page does not have quote data yet, so affordability is evaluated
 * only when a monthly rent is supplied by the caller.
 */
export function evaluateCollectedApplication(
  answers: ApplicationAnswers,
  context: ApplicationEvaluationContext
): ApplicationDecision {
  const customerType = answerString(answers.q_customer_type);
  if (customerType !== 'consumer' && customerType !== 'sole_trader' && customerType !== 'company') {
    return { decision: 'declined', reasons: ['missing_required_information'] };
  }

  const monthlyIncome = answerCents(answers.q_monthly_income);
  const hasAffordabilityInputs =
    customerType !== 'consumer' ||
    (context.monthlyRentWithVatCents !== undefined && monthlyIncome !== undefined);

  return evaluateApplication({
    customerType,
    contractStartDate: context.contractStartDate,
    birthDate: answerString(answers.q_birth_date),
    country: answerString(answers.q_country) ?? 'FI',
    financedAmountCents: context.financedAmountCents,
    monthlyRentWithVatCents: hasAffordabilityInputs ? context.monthlyRentWithVatCents : 0,
    monthlyNetIncomeCents: hasAffordabilityInputs ? monthlyIncome : 0,
    businessId: answerString(answers.q_business_id),
    applicantCanSign:
      answers.q_can_sign === 'yes' ? true : answers.q_can_sign === 'no' ? false : undefined,
    isPep: answers.q_pep === 'yes',
  });
}

function answerString(answer: unknown): string | undefined {
  return typeof answer === 'string' && answer.trim() ? answer.trim() : undefined;
}

function answerCents(answer: unknown): number | undefined {
  if (typeof answer === 'number' && Number.isInteger(answer)) return answer;
  if (typeof answer !== 'string' || !answer.trim()) return undefined;
  const parsed = Number(answer.replace(',', '.'));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed * 100 : undefined;
}
