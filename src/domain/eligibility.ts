// The eligibility rules from data/questions.json: yes, no or "a person will check", with reasons.
//
// A fact can come from the form or the customer record. The form answer wins, and the record
// fills in when the question was not asked, since q_monthly_income and q_pep only appear for
// larger deals. So a false answer can pass; the one exception is PEP status, which counts
// from either source because a PEP must never be auto-approved.
import type { Answers, ApplicationDecision, EligibilityReason } from '@/data/lease-schemas';
import type { Customer, Question } from '@/data/schemas';
import { ageOn, eligibleFrom } from './age';
import { isValidBusinessId } from './business-id';

// In the data only as English text, unlike the age and country limits below.
const MAX_RENT_PERCENT_OF_INCOME = 30;

export type EligibilityInput = {
  /** The question bank: the age and country limits are read from it. */
  questions: readonly Question[];
  customer: Customer;
  /** Answers that have passed `invalidAnswers`, with stale ones already dropped. */
  answers: Answers;
  /** The planned contract start: age is judged on this date. */
  startOn: string;
  /** Monthly rent including VAT, or `null` when the financed amount is outside the table. */
  monthlyRentWithVatCents: number | null;
};

export type Eligibility = {
  decision: ApplicationDecision;
  reasons: EligibilityReason[];
  /** When someone too young reaches the minimum age, so the UI can say "not yet". */
  eligible_from: string | null;
};

function blockRules(questions: readonly Question[], questionId: string) {
  const question = questions.find((q) => q.id === questionId);
  if (!question) throw new Error(`data/questions.json has no ${questionId} question`);
  return { options: question.options ?? [], rules: question.blocks_application_when ?? [] };
}

/** The minimum age, from the rule that stops the form at q_birth_date. */
export function minimumAge(questions: readonly Question[]): number {
  const rule = blockRules(questions, 'q_birth_date').rules.find((r) => r.rule === 'age_under');
  if (rule?.rule !== 'age_under') throw new Error('q_birth_date has no minimum age rule');
  return rule.value;
}

/** The q_country options that do not stop the form. */
export function allowedCountries(questions: readonly Question[]): string[] {
  const { options, rules } = blockRules(questions, 'q_country');
  const blocked = rules.flatMap((rule) => (rule.rule === 'answer_in' ? rule.value : []));
  return options.filter((option) => !blocked.includes(option));
}

function textAnswer(answers: Answers, questionId: string): string | undefined {
  const value = answers[questionId];
  return typeof value === 'string' ? value : undefined;
}

function moneyAnswer(answers: Answers, questionId: string): number | undefined {
  const value = answers[questionId];
  return typeof value === 'number' ? value : undefined;
}

/** The applicant's birth date: the form answer, else the record. Companies have none. */
export function applicantBirthDate(customer: Customer, answers: Answers): string | null {
  if (customer.type === 'company') return null;
  return textAnswer(answers, 'q_birth_date') ?? customer.birth_date;
}

/** Compares in whole numbers: rent ÷ income ≤ 30 % is the same as rent × 100 ≤ income × 30. */
function isAffordable(rentCents: number, incomeCents: number): boolean {
  return rentCents * 100 <= incomeCents * MAX_RENT_PERCENT_OF_INCOME;
}

/**
 * Any failed rule rejects the application, and every failed rule is listed so the customer
 * sees all of them at once. Otherwise a PEP goes to manual review. Everyone else is approved.
 * Who may sign for a company is not an eligibility rule: it is checked at signing.
 */
export function decide(input: EligibilityInput): Eligibility {
  const { questions, customer, answers, startOn, monthlyRentWithVatCents } = input;
  const reasons: EligibilityReason[] = [];
  let eligible_from: string | null = null;

  const minAge = minimumAge(questions);
  const birthDate = applicantBirthDate(customer, answers);
  if (birthDate !== null && ageOn(birthDate, startOn) < minAge) {
    reasons.push('min_age');
    eligible_from = eligibleFrom(birthDate, minAge);
  }

  const country = textAnswer(answers, 'q_country') ?? customer.country;
  if (!allowedCountries(questions).includes(country)) reasons.push('residency');

  if (customer.type === 'consumer' && monthlyRentWithVatCents !== null) {
    const income = moneyAnswer(answers, 'q_monthly_income') ?? customer.monthly_net_income_cents;
    if (!isAffordable(monthlyRentWithVatCents, income)) reasons.push('affordability');
  }

  if (customer.type !== 'consumer') {
    const businessId = textAnswer(answers, 'q_business_id') ?? customer.business_id;
    if (!isValidBusinessId(businessId)) reasons.push('business_id');
  }

  if (monthlyRentWithVatCents === null) reasons.push('financed_limits');

  if (reasons.length > 0) return { decision: 'rejected', reasons, eligible_from };

  if (customer.is_pep || answers.q_pep === 'yes') {
    return { decision: 'manual_review', reasons: ['pep_manual_review'], eligible_from: null };
  }
  return { decision: 'approved', reasons: [], eligible_from: null };
}
