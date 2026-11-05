// The six eligibility rules from data/questions.json, each with a reasoned outcome, so the
// decision screen can show WHY. Decision: any failed rule → declined; otherwise any manual
// flag → manual_review (a PEP is never auto-approved); otherwise approved.
import type { CoefficientTable } from '@/data/schemas';
import { checkAffordability } from './affordability';
import { validateFinnishBusinessId } from './business-id';
import { yearsOld } from './calendar';
import { monthlyFactorFor } from './coefficient';

export type CustomerType = 'consumer' | 'sole_trader' | 'company';

export type EligibilityInput = {
  customerType: CustomerType;
  /** From q_birth_date; null when not asked (companies). */
  birthDate: string | null;
  /** From q_country; null when not asked (companies are domestic by business ID). */
  country: string | null;
  /** From q_business_id; null for consumers. */
  businessId: string | null;
  /** From q_monthly_income; null when not asked (deals under €2,000). */
  monthlyNetIncomeCents: number | null;
  /** From q_pep; null when not asked (deals under €10,000). */
  pepAnswer: 'yes' | 'no' | null;
  startDate: string;
  financedCents: number;
  termMonths: number;
  monthlyRentWithVatCents: number;
  table: CoefficientTable;
};

export type RuleOutcome = 'passed' | 'failed' | 'manual_review' | 'not_applicable';

export type EligibilityReason = {
  rule:
    | 'min_age'
    | 'residency'
    | 'affordability'
    | 'business_id'
    | 'pep_manual_review'
    | 'financed_limits';
  outcome: RuleOutcome;
  /** Machine-readable details the UI turns into localized text. */
  params?: Record<string, string | number>;
};

export type EligibilityDecision = {
  decision: 'approved' | 'declined' | 'manual_review';
  reasons: EligibilityReason[];
};

const RESIDENCY_COUNTRIES = ['FI', 'SE', 'EE'];
const MIN_AGE = 18;

export function evaluateEligibility(input: EligibilityInput): EligibilityDecision {
  const reasons: EligibilityReason[] = [];

  // min_age: consumers and sole traders, 18 or older on the contract start date.
  if (input.customerType === 'company' || input.birthDate === null) {
    reasons.push({ rule: 'min_age', outcome: 'not_applicable' });
  } else {
    const age = yearsOld(input.birthDate, input.startDate);
    reasons.push(
      age >= MIN_AGE
        ? { rule: 'min_age', outcome: 'passed', params: { age } }
        : {
            rule: 'min_age',
            outcome: 'failed',
            params: {
              age,
              eligibleFrom: `${Number(input.birthDate.slice(0, 4)) + MIN_AGE}${input.birthDate.slice(4)}`,
            },
          }
    );
  }

  // residency: FI, SE or EE.
  if (input.country === null) {
    reasons.push({ rule: 'residency', outcome: 'not_applicable' });
  } else {
    reasons.push({
      rule: 'residency',
      outcome: RESIDENCY_COUNTRIES.includes(input.country) ? 'passed' : 'failed',
      params: { country: input.country },
    });
  }

  // affordability: consumers only; unknown income passes because the bank chose not to ask.
  const affordability = checkAffordability({
    monthlyRentWithVatCents: input.monthlyRentWithVatCents,
    monthlyNetIncomeCents: input.monthlyNetIncomeCents,
    isConsumer: input.customerType === 'consumer',
  });
  if (affordability.status === 'not_assessed') {
    reasons.push({
      rule: 'affordability',
      outcome: affordability.reason === 'income_not_asked' ? 'passed' : 'not_applicable',
      params: { note: affordability.reason },
    });
  } else {
    reasons.push({
      rule: 'affordability',
      outcome: affordability.status,
      params: {
        limitCents: affordability.limitCents,
        monthlyRentWithVatCents: input.monthlyRentWithVatCents,
      },
    });
  }

  // business_id: sole traders and companies need a valid check digit.
  if (input.customerType === 'consumer') {
    reasons.push({ rule: 'business_id', outcome: 'not_applicable' });
  } else {
    const result = validateFinnishBusinessId(input.businessId ?? '');
    reasons.push(
      result.ok
        ? { rule: 'business_id', outcome: 'passed' }
        : { rule: 'business_id', outcome: 'failed', params: { reason: result.reason } }
    );
  }

  // pep_manual_review: a PEP is never auto-approved.
  if (input.pepAnswer === null) {
    reasons.push({ rule: 'pep_manual_review', outcome: 'not_applicable' });
  } else {
    reasons.push({
      rule: 'pep_manual_review',
      outcome: input.pepAnswer === 'yes' ? 'manual_review' : 'passed',
    });
  }

  // financed_limits: the amount must fit a coefficient-table band.
  const factor = monthlyFactorFor(input.table, input.financedCents, input.termMonths);
  reasons.push(
    factor.ok
      ? { rule: 'financed_limits', outcome: 'passed', params: { band: factor.band.band } }
      : { rule: 'financed_limits', outcome: 'failed', params: { reason: factor.reason } }
  );

  const decision = reasons.some((r) => r.outcome === 'failed')
    ? 'declined'
    : reasons.some((r) => r.outcome === 'manual_review')
      ? 'manual_review'
      : 'approved';
  return { decision, reasons };
}
