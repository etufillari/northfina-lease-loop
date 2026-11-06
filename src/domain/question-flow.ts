import type { AskWhenCondition, AssetCategory, Customer, Question } from '@/data/schemas';
import { isIsoDate } from './calendar';

export type Answer = string | number | string[];
export type Answers = Record<string, Answer>;
export type QuestionContext = {
  customer_type: Customer['type'] | undefined;
  category: AssetCategory;
  financed_amount_cents: number;
  term_months: number;
};
export type QuestionFlow = {
  answers: Answers;
  activeQuestions: Question[];
  removedIds: string[];
  invalidIds: string[];
  missingIds: string[];
};

/** An absent or invalid customer-type answer cannot select a hidden persona branch. */
export function customerTypeFromAnswers(answers: Answers): Customer['type'] | undefined {
  const value = answers.q_customer_type;
  return value === 'consumer' || value === 'sole_trader' || value === 'company' ? value : undefined;
}

function matches(condition: AskWhenCondition, context: QuestionContext, answers: Answers): boolean {
  const value = condition.field.startsWith('answers.')
    ? answers[condition.field.slice('answers.'.length)]
    : context[condition.field as keyof QuestionContext];
  if (condition.op === 'in') return typeof value === 'string' && condition.value.includes(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return condition.op === 'gte' ? value >= condition.value : value <= condition.value;
}

function isValid(question: Question, value: Answer): boolean {
  if (question.type === 'money')
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (question.type === 'list') {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 100 &&
      value.every(
        (item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 200
      )
    );
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 1000) return false;
  if (question.type === 'choice') return question.options?.includes(value) ?? false;
  if (question.type === 'date') return isIsoDate(value);
  if (question.type === 'email')
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return true;
}

/** Retains only valid answers to questions that still apply; never mutates the caller. */
export function normaliseAnswers(
  questions: readonly Question[],
  context: QuestionContext,
  input: Answers
): QuestionFlow {
  const byId = new Map(questions.map((question) => [question.id, question]));
  let answers: Answers = {};
  const invalidIds: string[] = [];
  for (const [id, value] of Object.entries(input)) {
    const question = byId.get(id);
    if (!question) continue;
    if (!isValid(question, value)) {
      invalidIds.push(id);
      continue;
    }
    answers[id] = Array.isArray(value)
      ? value.map((item) => item.trim())
      : typeof value === 'string'
        ? value.trim()
        : value;
  }

  // Removing one answer can deactivate a dependent question in the next pass.
  // Each pass only deletes keys, so at most input-key-count deletions can happen.
  let activeQuestions: Question[];
  let activeIds: Set<string>;
  while (true) {
    activeQuestions = questions.filter((question) =>
      question.ask_when.every((condition) => matches(condition, context, answers))
    );
    activeIds = new Set(activeQuestions.map((question) => question.id));
    const retained = Object.fromEntries(
      Object.entries(answers).filter(([id]) => activeIds.has(id))
    );
    // No keys were removed: this pass already describes the final answer set.
    if (Object.keys(retained).length === Object.keys(answers).length) break;
    answers = retained;
  }
  return {
    answers,
    activeQuestions,
    removedIds: Object.keys(input).filter((id) => !Object.hasOwn(answers, id)),
    invalidIds: invalidIds.filter((id) => activeIds.has(id)),
    missingIds: activeQuestions
      .filter((question) => !Object.hasOwn(answers, question.id))
      .map((question) => question.id),
  };
}

/** Editable demo prefill, not independent evidence for an eligibility decision. */
export function answersFromCustomer(customer: Customer): Answers {
  const answers: Answers = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_country: ['FI', 'SE', 'EE'].includes(customer.country) ? customer.country : 'other',
    q_pep: customer.is_pep ? 'yes' : 'no',
  };
  if (customer.type === 'company') {
    answers.q_company_name = customer.name;
    answers.q_can_sign = customer.applicant_can_sign ? 'yes' : 'no';
    answers.q_annual_revenue = customer.annual_revenue_cents;
    if (customer.beneficial_owners) answers.q_beneficial_owners = [...customer.beneficial_owners];
  } else {
    answers.q_full_name = customer.name;
    answers.q_birth_date = customer.birth_date;
  }
  if (customer.type === 'consumer') {
    answers.q_employment = customer.employment;
    answers.q_monthly_income = customer.monthly_net_income_cents;
  } else {
    answers.q_business_id = customer.business_id;
    answers.q_vat_registered = customer.vat_registered ? 'yes' : 'no';
  }
  return answers;
}
