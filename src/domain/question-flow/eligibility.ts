// The eligibility rules of data/questions.json and decision D9, as a pure function that
// returns a decision and its reasons as codes with params (team rule 6): the page writes the
// sentence in the visitor's language.
import type { ConsumerLimits, EligibilityRule } from '@/data/schemas';
import { isValidBusinessId } from './business-id';
import { plausibilityHolds } from './plausibility';

export type EligibilityDecision = 'approved' | 'rejected' | 'manual_review' | 'awaiting_signatory';

export type ReasonCode =
  | 'too_young'
  | 'residency_not_allowed'
  | 'unaffordable'
  | 'invalid_business_id'
  | 'financed_out_of_range'
  | 'missing_answer'
  | 'pep'
  | 'answer_differs_from_record'
  | 'quantity_over_consumer_cap'
  | 'category_needs_review'
  | 'income_implausible'
  | 'revenue_below_financed'
  | 'owners_implausible'
  | 'signatory_needed'
  | 'all_checks_passed';

export type Reason = { code: ReasonCode; params: Record<string, string | number> };

export type EligibilityResult = { decision: EligibilityDecision; reasons: Reason[] };

export type EligibilityInput = {
  customerType: string;
  /** The contract start date; the age is checked on this day. */
  startDate: string;
  birthDate?: string;
  country?: string;
  monthlyNetIncomeCents?: number;
  /** Monthly rent incl. VAT of the chosen term, computed by the caller from the quote. */
  grossMonthlyRentCents: number;
  businessId?: string;
  isPep: boolean;
  /** Companies only: false when the applicant may not sign for the company. */
  applicantCanSign?: boolean;
  signatoryEmail?: string;
  financedCents: number;
  /** The coefficient table's lowest and highest financed amount. */
  financedLimits?: { minCents: number; maxCents: number };
  /** Question ids answered other than the customer record (D38): each holds the case. */
  recordMismatches?: readonly string[];
  /** The asset's category and the quote's quantity, for the consumer caps. */
  category?: string;
  quantity?: number;
  /** Companies: not asked → undefined; asked but not a number → null. */
  annualRevenueCents?: number | null;
  beneficialOwners?: readonly string[];
  /** The team's consumer limits (`data/consumer-limits.json`); without them those rules are off. */
  consumerLimits?: ConsumerLimits;
};

export const MIN_AGE_YEARS = 18;
export const ALLOWED_COUNTRIES: readonly string[] = ['FI', 'SE', 'EE'];
/** Rent incl. VAT may be at most this percentage of monthly net income. */
export const AFFORDABILITY_PERCENT = 30;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The day someone born on `birthDate` turns `years`. Someone born on 29 February turns a
 * year older on 1 March in a year without one (the Finnish legal reading).
 */
export function birthdayAtAge(birthDate: string, years: number): string {
  const [y = 0, m = 0, d = 0] = birthDate.split('-').map(Number);
  const year = y + years;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (m === 2 && d === 29 && !isLeapYear(year)) return `${year}-03-01`;
  return `${year}-${pad(m)}-${pad(d)}`;
}

/**
 * The largest rent that passes: floor(30 % of income). The check itself compares in whole
 * numbers (rent × 100 ≤ income × 30), so no fraction of a cent is ever rounded.
 */
export function maxAffordableRentCents(monthlyNetIncomeCents: number): number {
  return Math.floor((monthlyNetIncomeCents * AFFORDABILITY_PERCENT) / 100);
}

const isPerson = (type: string) => type === 'consumer' || type === 'sole_trader';
const isBusiness = (type: string) => type === 'sole_trader' || type === 'company';

/** The rejections, one per rule id that is in `rules` and fails. */
function rejections(ruleIds: ReadonlySet<string>, input: EligibilityInput): Reason[] {
  const reasons: Reason[] = [];
  const { customerType: type } = input;

  if (ruleIds.has('min_age') && isPerson(type)) {
    if (input.birthDate === undefined) {
      reasons.push({ code: 'missing_answer', params: { question: 'q_birth_date' } });
    } else {
      const eighteenOn = birthdayAtAge(input.birthDate, MIN_AGE_YEARS);
      if (input.startDate < eighteenOn) {
        reasons.push({ code: 'too_young', params: { birthDate: input.birthDate, eighteenOn } });
      }
    }
  }

  if (ruleIds.has('residency') && input.country !== undefined) {
    if (!ALLOWED_COUNTRIES.includes(input.country)) {
      reasons.push({ code: 'residency_not_allowed', params: { country: input.country } });
    }
  }

  // The bank asks consumers for income only from 200 000 financed; below that it is not asked
  // and the rule is not applied (the bank's targeting is the rule's scope).
  if (
    ruleIds.has('affordability') &&
    type === 'consumer' &&
    input.monthlyNetIncomeCents !== undefined
  ) {
    const income = input.monthlyNetIncomeCents;
    if (input.grossMonthlyRentCents * 100 > income * AFFORDABILITY_PERCENT) {
      reasons.push({
        code: 'unaffordable',
        params: {
          grossMonthlyRentCents: input.grossMonthlyRentCents,
          maxRentCents: maxAffordableRentCents(income),
          monthlyNetIncomeCents: income,
        },
      });
    }
  }

  if (ruleIds.has('business_id') && isBusiness(type)) {
    const id = input.businessId ?? '';
    if (!isValidBusinessId(id)) {
      reasons.push({ code: 'invalid_business_id', params: { businessId: id.trim() } });
    }
  }

  if (ruleIds.has('financed_limits') && input.financedLimits !== undefined) {
    const { minCents, maxCents } = input.financedLimits;
    if (input.financedCents < minCents || input.financedCents > maxCents) {
      reasons.push({
        code: 'financed_out_of_range',
        params: { financedCents: input.financedCents, minCents, maxCents },
      });
    }
  }

  return reasons;
}

/**
 * The decision, in this order: any failed rule → rejected (every failure listed); else a PEP,
 * an answer that differs from the customer record (D38) or a plausibility hold
 * (`plausibilityHolds`) → manual_review (never auto-approved, every reason listed); else a company applicant who cannot sign →
 * awaiting_signatory (the named signatory signs); else approved. Rules not listed in
 * `rules` (by id) are not checked; unknown ids are ignored.
 */
export function evaluate(
  rules: readonly EligibilityRule[],
  input: EligibilityInput
): EligibilityResult {
  const ruleIds = new Set(rules.map((rule) => rule.id));

  const rejected = rejections(ruleIds, input);
  if (rejected.length > 0) return { decision: 'rejected', reasons: rejected };

  const held: Reason[] = [];
  if (ruleIds.has('pep_manual_review') && input.isPep) held.push({ code: 'pep', params: {} });
  for (const question of input.recordMismatches ?? []) {
    held.push({ code: 'answer_differs_from_record', params: { question } });
  }
  held.push(...plausibilityHolds(input.consumerLimits, input));
  const cannotSign = input.customerType === 'company' && input.applicantCanSign === false;
  const signatory: Reason = {
    code: 'signatory_needed',
    params: input.signatoryEmail ? { signatoryEmail: input.signatoryEmail } : {},
  };

  if (held.length > 0) {
    return { decision: 'manual_review', reasons: cannotSign ? [...held, signatory] : held };
  }
  if (cannotSign) return { decision: 'awaiting_signatory', reasons: [signatory] };
  return { decision: 'approved', reasons: [{ code: 'all_checks_passed', params: {} }] };
}
