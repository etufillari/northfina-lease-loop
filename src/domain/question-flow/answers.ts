// From the applicant's answers to the eligibility input, and the small conversions around it.
import type { ConsumerLimits, Customer, Question } from '@/data/schemas';
import { splitVat } from '@/domain/money-math';
import type { Answer, Answers, FlowContext } from './engine';
import type { EligibilityInput } from './eligibility';
import { sameEmail } from './signatory';

const text = (answer: Answer | undefined): string | undefined =>
  typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : undefined;

/**
 * Euros as typed by a person ("3200", "3 200,50", "3200.5") → integer cents, without
 * floating point: the digits are split at the decimal mark and joined. Null when it is not
 * an amount (negative, more than two decimals, letters).
 */
export function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s€]/g, ''); // \s includes the no-break space
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Cents as an amount to edit: whole euros ("3200"), or with the cents after `decimalMark`
 * ("3200.50" in English, "3200,50" in Finnish, Swedish and Estonian). No grouping, so
 * `parseEurosToCents` reads back exactly what it shows. One formatter for the question flow
 * and the price page (review finding 14: the flow wrote "," in English too).
 */
export function centsToEuroInput(cents: number, decimalMark: '.' | ','): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`cents must be a whole number ≥ 0, got ${cents}`);
  }
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros}${decimalMark}${String(rest).padStart(2, '0')}`;
}

/**
 * Whether an answer has the shape its question type needs. Choice: one of the options;
 * date: an ISO day; money: integer cents as digits; email: something@something; list: at
 * least one non-blank item; text: not blank. The business-id check digit is an eligibility
 * rule (a wrong one is a reason, not a typo to bounce), so text only needs a value.
 */
export function validateAnswer(question: Question, answer: Answer): boolean {
  if (question.type === 'list') {
    return Array.isArray(answer) && answer.length > 0 && answer.every((a) => a.trim() !== '');
  }
  const value = text(answer);
  if (value === undefined) return false;
  switch (question.type) {
    case 'choice':
      return question.options?.includes(value) ?? false;
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && isRealDay(value);
    case 'money':
      return /^\d{1,13}$/.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'text':
      return value.length <= 500;
  }
}

/** The oldest applicant we take as a real answer, in years (D37). */
export const MAX_AGE_YEARS = 120;

/**
 * The birth dates that are real answers on `today`: from the same day 120 years ago up to
 * today (D37). On 29 February the earliest day falls on 28 February when that year has no
 * 29th. "Too young" is an eligibility reason, not a typo: only a future day is refused here.
 */
export function birthDateRange(today: string): { earliest: string; latest: string } {
  const [y = 0, m = 0, d = 0] = today.split('-').map(Number);
  const year = y - MAX_AGE_YEARS;
  const day = m === 2 && d === 29 && !isRealDay(`${year}-02-29`) ? 28 : d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { earliest: `${String(year).padStart(4, '0')}-${pad(m)}-${pad(day)}`, latest: today };
}

export type AnswerProblem =
  | { code: 'invalid'; params: Record<string, never> }
  | { code: 'birth_date_out_of_range'; params: { earliest: string; latest: string } }
  | { code: 'signatory_is_applicant'; params: Record<string, never> };

/**
 * Why an answer cannot be taken, as a code for the page, or null when it can. First the
 * shape (`validateAnswer`), then the checks that need the day or the other answers: a birth
 * date from the future or more than 120 years back (D37), and a signatory e-mail that is the
 * applicant's own (D39), since the applicant would then sign for themself. "Own" is the
 * e-mail answered (`q_email`) and the one on the customer record (`applicantEmail`): with
 * the answer alone, another `q_email` would let the applicant name their record address.
 */
export function answerProblem(
  question: Question,
  answer: Answer,
  flow: { today: string; answers?: Answers; applicantEmail?: string }
): AnswerProblem | null {
  if (!validateAnswer(question, answer)) return { code: 'invalid', params: {} };
  const value = text(answer);
  if (question.id === 'q_birth_date' && value !== undefined) {
    const range = birthDateRange(flow.today);
    if (value < range.earliest || value > range.latest) {
      return { code: 'birth_date_out_of_range', params: range };
    }
  }
  if (
    question.id === 'q_signatory_email' &&
    (sameEmail(value, text(flow.answers?.q_email)) || sameEmail(value, flow.applicantEmail))
  ) {
    return { code: 'signatory_is_applicant', params: {} };
  }
  return null;
}

function isRealDay(iso: string): boolean {
  const [y = 0, m = 0, d = 0] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
  return d <= days;
}

/** A money answer (integer cents as digits) → cents, or undefined. */
function cents(answer: Answer | undefined): number | undefined {
  const value = text(answer);
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;
}

/**
 * Gross = net + VAT, through the one money rounding (`splitVat`, D1): the VAT is rounded half
 * up to the cent once from the net. 10 730 at 2 550 bp → VAT 2 736, gross 13 466.
 */
export function grossFromNetCents(netCents: number, vatRateBp: number): number {
  return splitVat(netCents, vatRateBp).grossCents;
}

export type InputFromAnswers = {
  context: FlowContext;
  answers: Answers;
  startDate: string;
  grossMonthlyRentCents: number;
  financedLimits?: { minCents: number; maxCents: number };
  /** Question ids answered other than the customer record (`recordMismatches`, D38). */
  recordMismatches?: readonly string[];
  /** The quote's quantity, for the consumer cap. */
  quantity?: number;
  /**
   * The customer record's country: residency is checked on it when the flow did not ask (only
   * people are asked), so a company on record outside FI, SE and EE is refused too (review
   * finding 12). An answered country wins.
   */
  recordCountry?: string;
  /** The team's consumer limits; without them the consumer caps are not applied. */
  consumerLimits?: ConsumerLimits;
};

/** The eligibility input from the (pruned) answers of a flow. */
export function eligibilityInputFromAnswers(args: InputFromAnswers): EligibilityInput {
  const { answers, context } = args;
  const canSign = text(answers.q_can_sign);
  return {
    customerType: text(answers.q_customer_type) ?? context.customerType,
    startDate: args.startDate,
    birthDate: text(answers.q_birth_date),
    country: text(answers.q_country) ?? args.recordCountry,
    monthlyNetIncomeCents: cents(answers.q_monthly_income),
    grossMonthlyRentCents: args.grossMonthlyRentCents,
    businessId: text(answers.q_business_id),
    // Only the answer (D82, the organisers' rule): below the PEP threshold the question is
    // hidden, so no PEP check runs, whatever the customer record says.
    isPep: text(answers.q_pep) === 'yes',
    applicantCanSign: canSign === undefined ? undefined : canSign === 'yes',
    signatoryEmail: text(answers.q_signatory_email),
    financedCents: context.financedCents,
    financedLimits: args.financedLimits,
    recordMismatches: args.recordMismatches,
    category: context.category,
    quantity: args.quantity,
    annualRevenueCents:
      'q_annual_revenue' in answers ? (cents(answers.q_annual_revenue) ?? null) : undefined,
    beneficialOwners: Array.isArray(answers.q_beneficial_owners)
      ? answers.q_beneficial_owners
      : undefined,
    consumerLimits: args.consumerLimits,
  };
}

/**
 * The answers a data-pack customer would give, so a demo can pre-fill the flow and the tests
 * can run every persona. Fields the pack does not know (usage purpose, farm registry, PEP
 * details) get a neutral placeholder.
 */
export function answersFromCustomer(customer: Customer): Record<string, Answer> {
  const answers: Record<string, Answer> = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_usage_purpose: 'commuting',
    q_farm_registry: '123-456-789',
    q_pep: customer.is_pep ? 'yes' : 'no',
  };
  if (customer.is_pep) answers.q_pep_details = '-';
  if (customer.type === 'consumer' || customer.type === 'sole_trader') {
    answers.q_full_name = customer.name;
    answers.q_birth_date = customer.birth_date;
    answers.q_country = ['FI', 'SE', 'EE'].includes(customer.country) ? customer.country : 'other';
  }
  if (customer.type === 'consumer') {
    answers.q_employment = customer.employment;
    answers.q_monthly_income = String(customer.monthly_net_income_cents);
  }
  if (customer.type === 'sole_trader' || customer.type === 'company') {
    answers.q_business_id = customer.business_id;
    answers.q_vat_registered = customer.vat_registered ? 'yes' : 'no';
  }
  if (customer.type === 'company') {
    answers.q_company_name = customer.name;
    answers.q_can_sign = customer.applicant_can_sign ? 'yes' : 'no';
    if (!customer.applicant_can_sign)
      answers.q_signatory_email = `signatory@${customer.email.split('@')[1]}`;
    answers.q_annual_revenue = String(customer.annual_revenue_cents);
    answers.q_beneficial_owners = customer.beneficial_owners ?? ['-'];
  }
  return answers;
}
