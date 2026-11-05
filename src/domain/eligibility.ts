// Smart Problem 4: turns the answers of an application into yes / no / manual review, with reasons.
// The rules are the `eligibility_rules` of data/questions.json plus the `blocks_application_when`
// and `validation` settings on the questions themselves.
import type { CoefficientTable, Question } from '@/data/schemas';
import { isValidBusinessId } from './business-id';
import { monthlyFactorFor } from './coefficient';
import { pruneAnswers, visibleQuestions, type AnswerValue, type FlowDeal } from './question-flow';

/** Share of monthly net income a consumer may spend on rent incl. VAT: 30 % (rule `affordability`). */
const AFFORDABILITY_PERCENT = 30;

/**
 * One reason behind a decision. `rule` is the id of an eligibility rule (`min_age`, `residency`,
 * `affordability`, `business_id`, `pep_manual_review`, `financed_limits`) or one of the extra ids
 * `blocked_answer` and `signatory_required`. The UI translates `rule` and fills in `params`.
 */
export type Reason = {
  rule: string;
  outcome: 'no' | 'manual_review';
  params: Record<string, string | number>;
};

export type EligibilityDecision =
  | { decision: 'yes' | 'no' | 'manual_review'; reasons: Reason[] }
  /** Some applicable questions are still unanswered, so nothing can be approved yet. */
  | { decision: 'incomplete'; missing: string[]; reasons: Reason[] };

export type EligibilityInput = {
  questions: readonly Question[];
  coefficientTable: CoefficientTable;
  /** The deal the applicant is applying for. */
  deal: FlowDeal & { financed_amount_cents: number; term_months: number };
  answers: Readonly<Record<string, AnswerValue | undefined>>;
  /** `YYYY-MM-DD`. The age check is done on this day, not on today's date. */
  contractStartDate: string;
  /**
   * Monthly rent incl. VAT in cents, from the pricing step. Only needed for the consumer
   * affordability rule; leave it out when pricing is not available (the rule is then skipped).
   */
  monthlyRentInclVatCents?: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Whole years between a birth date and a reference date (both `YYYY-MM-DD`), or null if either is
 * malformed. A birthday counts on its own day; 29 February births turn a year older on 1 March
 * in non-leap years.
 */
export function ageOn(birthDate: string, onDate: string): number | null {
  const birth = parseIso(birthDate);
  const on = parseIso(onDate);
  if (!birth || !on) return null;
  const hadBirthday = on.m > birth.m || (on.m === birth.m && on.d >= birth.d);
  return on.y - birth.y - (hadBirthday ? 0 : 1);
}

const isBlank = (value: AnswerValue | undefined) =>
  value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * Decides an application.
 *
 * - `no` as soon as any hard rule fails, even while other questions are unanswered (no point
 *   asking more of someone who is under 18).
 * - Otherwise `incomplete` while an applicable question has no answer.
 * - Otherwise `manual_review` if any rule asks for a person, else `yes`.
 *
 * Only answers to applicable questions count; stale ones are pruned first.
 */
export function decideEligibility(input: EligibilityInput): EligibilityDecision {
  const { questions, deal, contractStartDate } = input;
  const ctx = { deal, answers: input.answers };
  const answers = pruneAnswers(questions, ctx).kept;
  const visible = visibleQuestions(questions, { deal, answers });

  const reasons: Reason[] = [];
  const missing: string[] = [];

  for (const question of visible) {
    const answer = answers[question.id];
    if (isBlank(answer)) {
      missing.push(question.id);
      continue;
    }
    reasons.push(...questionReasons(question, answer!, contractStartDate, missing));
  }

  reasons.push(...dealReasons(input, answers));

  const hardNo = reasons.filter((r) => r.outcome === 'no');
  if (hardNo.length > 0) return { decision: 'no', reasons: hardNo };
  if (missing.length > 0) return { decision: 'incomplete', missing, reasons };
  return reasons.length > 0
    ? { decision: 'manual_review', reasons }
    : { decision: 'yes', reasons: [] };
}

/** Reasons that come from one answered question: its block rules and its validation. */
function questionReasons(
  question: Question,
  answer: AnswerValue,
  contractStartDate: string,
  missing: string[]
): Reason[] {
  const reasons: Reason[] = [];

  for (const block of question.blocks_application_when ?? []) {
    if (block.rule === 'age_under') {
      const age = ageOn(String(answer), contractStartDate);
      if (age === null) {
        missing.push(question.id); // not a usable date: ask again
      } else if (age < block.value) {
        reasons.push({
          rule: 'min_age',
          outcome: 'no',
          params: { question: question.id, age, minimum: block.value },
        });
      }
    } else if (block.value.includes(String(answer))) {
      reasons.push({
        // The only answer-based block in the data pack is the country, which is rule `residency`.
        rule: question.id === 'q_country' ? 'residency' : 'blocked_answer',
        outcome: 'no',
        params: { question: question.id, answer: String(answer) },
      });
    }
  }

  if (question.validation?.format === 'finnish_business_id' && !isValidBusinessId(String(answer))) {
    reasons.push({
      rule: 'business_id',
      outcome: 'no',
      params: { question: question.id, answer: String(answer) },
    });
  }
  return reasons;
}

/** Reasons that come from the deal or from a combination of answers. */
function dealReasons(
  input: EligibilityInput,
  answers: Readonly<Record<string, AnswerValue | undefined>>
): Reason[] {
  const { deal, coefficientTable, monthlyRentInclVatCents } = input;
  const reasons: Reason[] = [];

  const factor = monthlyFactorFor(coefficientTable, deal.financed_amount_cents, deal.term_months);
  if (!factor.ok) {
    reasons.push({
      rule: 'financed_limits',
      outcome: 'no',
      params: {
        reason: factor.reason,
        financedCents: deal.financed_amount_cents,
        termMonths: deal.term_months,
      },
    });
  }

  if (answers['q_pep'] === 'yes') {
    reasons.push({ rule: 'pep_manual_review', outcome: 'manual_review', params: {} });
  }

  // Not one of the six data-pack rules: the applicant cannot sign, so a person must contact the
  // signatory instead of the application being approved or refused outright.
  if (answers['q_can_sign'] === 'no') {
    reasons.push({ rule: 'signatory_required', outcome: 'manual_review', params: {} });
  }

  const income = answers['q_monthly_income'];
  if (typeof income === 'number' && monthlyRentInclVatCents !== undefined) {
    // rent > 30 % of income, written with integers: rent * 100 > income * 30.
    if (monthlyRentInclVatCents * 100 > income * AFFORDABILITY_PERCENT) {
      reasons.push({
        rule: 'affordability',
        outcome: 'no',
        params: { rentCents: monthlyRentInclVatCents, incomeCents: income },
      });
    }
  }
  return reasons;
}
