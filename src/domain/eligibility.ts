// The eligibility rules from data/questions.json: yes, no or "a person will check", with reasons.
//
// A fact can come from the form or the customer record. The form answer wins, and the record
// fills in when the question was not asked, since q_monthly_income and q_pep only appear for
// larger deals. So a false answer can pass; the one exception is PEP status, which counts
// from either source because a PEP must never be auto-approved.
import type { Answers, ApplicationDecision, EligibilityReason } from '@/data/lease-schemas';
import type { Customer } from '@/data/schemas';
import { ageOn, eligibleFrom } from './age';
import { isValidBusinessId } from './business-id';

export const MIN_AGE = 18;
const ALLOWED_COUNTRIES = ['FI', 'SE', 'EE'];
const MAX_RENT_PERCENT_OF_INCOME = 30;

export type EligibilityInput = {
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
  const { customer, answers, startOn, monthlyRentWithVatCents } = input;
  const reasons: EligibilityReason[] = [];
  let eligible_from: string | null = null;

  const birthDate = applicantBirthDate(customer, answers);
  if (birthDate !== null && ageOn(birthDate, startOn) < MIN_AGE) {
    reasons.push('min_age');
    eligible_from = eligibleFrom(birthDate, MIN_AGE);
  }

  const country = textAnswer(answers, 'q_country') ?? customer.country;
  if (!ALLOWED_COUNTRIES.includes(country)) reasons.push('residency');

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
