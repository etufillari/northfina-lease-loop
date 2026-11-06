import { customerSchema, type Customer, type Question } from '@/data/schemas';
import { pruneQuestionAnswers, type QuestionFacts } from './question-flow';
import { parseDownPaymentCents } from './monthly-rent';

/** Persist/evaluate applicable self-declared data; never upgrade authoritative signer/PEP flags. */
export function prepareApplicationAnswers(
  customer: Customer,
  questions: readonly Question[],
  facts: QuestionFacts,
  input: Readonly<Record<string, string>>
) {
  if (
    Object.keys(input).some((id) => !questions.some((q) => q.id === id)) ||
    (input.q_customer_type && input.q_customer_type !== customer.type)
  )
    return { ok: false as const };
  const answers = pruneQuestionAnswers(questions, facts, input);
  for (const [id, value] of Object.entries(answers)) {
    const question = questions.find((q) => q.id === id);
    if (
      typeof value !== 'string' ||
      value.length > 5000 ||
      (question?.options && !question.options.includes(value))
    )
      return { ok: false as const };
  }
  const candidate: Record<string, unknown> = { ...customer };
  for (const [answer, field] of [
    ['q_full_name', 'name'],
    ['q_company_name', 'name'],
    ['q_country', 'country'],
    ['q_email', 'email'],
    ['q_birth_date', 'birth_date'],
    ['q_business_id', 'business_id'],
    ['q_employment', 'employment'],
  ] as const) {
    if (answers[answer]) candidate[field] = answers[answer];
  }
  if (answers.q_monthly_income)
    candidate.monthly_net_income_cents = parseDownPaymentCents(answers.q_monthly_income);
  if (answers.q_annual_revenue)
    candidate.annual_revenue_cents = parseDownPaymentCents(answers.q_annual_revenue);
  candidate.is_pep = customer.is_pep || answers.q_pep === 'yes';
  if (customer.type === 'company')
    candidate.applicant_can_sign = customer.applicant_can_sign && answers.q_can_sign !== 'no';
  const validated = customerSchema.safeParse(candidate);
  return validated.success
    ? { ok: true as const, customer: validated.data, answers }
    : { ok: false as const };
}
