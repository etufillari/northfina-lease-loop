import type { AssetCategory, CoefficientTable, Customer, Question } from '@/data/schemas';
import { isFinnishBusinessId } from './business-id';
import { ageOn } from './calendar';
import { monthlyFactorFor } from './coefficient';
import { customerTypeFromAnswers, normaliseAnswers, type Answers } from './question-flow';

export type EligibilityReason =
  | 'under_age'
  | 'residency'
  | 'unaffordable'
  | 'invalid_business_id'
  | 'pep'
  | 'signatory_required'
  | 'profile_conflict'
  | 'answers_missing'
  | 'answers_invalid'
  | 'financed_limits'
  | 'blocked_answer';

export type EligibilityDecision = {
  status: 'approved' | 'declined' | 'manual_review' | 'incomplete';
  reasons: EligibilityReason[];
  answers: Answers;
  missingQuestionIds: string[];
  invalidQuestionIds: string[];
};

type EligibilityInput = {
  customer: Customer;
  answers: Answers;
  questions: readonly Question[];
  category: AssetCategory;
  financedCents: number;
  termMonths: number;
  monthlyGrossCents: number;
  startDate: string;
  table: CoefficientTable;
};

/** Decisions use disclosed active answers; demo personas only prefill the questionnaire. */
export function evaluateEligibility(input: EligibilityInput): EligibilityDecision {
  const { questions, financedCents, termMonths, monthlyGrossCents, startDate, table } = input;
  if (!Number.isSafeInteger(monthlyGrossCents) || monthlyGrossCents < 0) {
    throw new RangeError('monthly gross must be non-negative safe integer cents');
  }
  const flow = normaliseAnswers(
    questions,
    {
      customer_type: customerTypeFromAnswers(input.answers),
      category: input.category,
      financed_amount_cents: financedCents,
      term_months: termMonths,
    },
    input.answers
  );
  const declined = new Set<EligibilityReason>();
  const review = new Set<EligibilityReason>();

  if (!monthlyFactorFor(table, financedCents, termMonths).ok) declined.add('financed_limits');
  if (flow.answers.q_pep === 'yes') review.add('pep');
  const income = flow.answers.q_monthly_income;
  if (flow.answers.q_customer_type === 'consumer' && typeof income === 'number') {
    // BigInt keeps the exact 30% boundary, including VAT, without fractional cents.
    if (BigInt(monthlyGrossCents) * 100n > BigInt(income) * 30n) declined.add('unaffordable');
  }
  const businessId = flow.answers.q_business_id;
  if (typeof businessId === 'string' && !isFinnishBusinessId(businessId)) {
    declined.add('invalid_business_id');
  }
  if (flow.answers.q_can_sign === 'no') review.add('signatory_required');

  // Age and residence apply only when their questions are active and validly answered.
  // Companies are not subject to the consumer/sole-trader residence check in this demo.
  for (const question of flow.activeQuestions) {
    const answer = flow.answers[question.id];
    for (const rule of question.blocks_application_when ?? []) {
      if (
        rule.rule === 'age_under' &&
        typeof answer === 'string' &&
        ageOn(answer, startDate) < rule.value
      ) {
        declined.add('under_age');
      }
      if (rule.rule === 'answer_in' && typeof answer === 'string' && rule.value.includes(answer)) {
        declined.add(question.id === 'q_country' ? 'residency' : 'blocked_answer');
      }
    }
  }

  const incomplete = flow.missingIds.length > 0 || flow.invalidIds.length > 0;
  const status =
    declined.size > 0
      ? 'declined'
      : incomplete
        ? 'incomplete'
        : review.size > 0
          ? 'manual_review'
          : 'approved';
  const reasons: EligibilityReason[] = [...declined, ...review];
  if (flow.invalidIds.length > 0) reasons.push('answers_invalid');
  if (flow.missingIds.length > 0) reasons.push('answers_missing');
  return {
    status,
    reasons,
    answers: flow.answers,
    missingQuestionIds: flow.missingIds,
    invalidQuestionIds: flow.invalidIds,
  };
}
