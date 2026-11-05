// Pure business logic for application question targeting, validation, and eligibility.
// Zero database, zero framework imports, no Date.now(), all money in cents.
import type { AssetCategory, Question } from '@/data/schemas';

export type CustomerType = 'consumer' | 'sole_trader' | 'company';

export type QuestionFlowContext = {
  customerType?: CustomerType;
  category: AssetCategory;
  financedAmountCents: number;
  termMonths: number;
  monthlyRentInclVatCents: number;
  todayIso: string; // YYYY-MM-DD
  /** Lowest band minimum from coefficient-table.json (default: 30 000 cents = €300). */
  minFinancedCents?: number;
  /** Highest band maximum from coefficient-table.json (default: 25 000 000 cents = €250 000). */
  maxFinancedCents?: number;
};

const FINNISH_Y_WEIGHTS = [7, 9, 10, 5, 8, 4, 2] as const;

/**
 * Validates a Finnish Business ID (Y-tunnus, format 1234567-8) using the official modulo-11 checksum.
 * Rules:
 * - 7 digits, hyphen, 1 check digit.
 * - Sum = sum(digit[i] * weight[i]) for i in 0..6.
 * - remainder = sum % 11.
 * - remainder == 0 -> check digit 0.
 * - remainder == 1 -> invalid (no valid check digit exists).
 * - remainder in 2..10 -> check digit (11 - remainder).
 */
export function isValidFinnishBusinessId(businessId: string): boolean {
  const trimmed = businessId.trim();
  const match = /^(\d{7})-(\d)$/.exec(trimmed);
  if (!match || !match[1] || match[2] === undefined) return false;

  const digits = match[1].split('').map(Number);
  const checkDigit = Number(match[2]);

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = digits[i];
    const w = FINNISH_Y_WEIGHTS[i];
    if (d === undefined || w === undefined) return false;
    sum += d * w;
  }

  const remainder = sum % 11;
  if (remainder === 0) return checkDigit === 0;
  if (remainder === 1) return false;
  return checkDigit === 11 - remainder;
}

/**
 * Calculates exact age in whole years on `referenceDateIso` from `birthDateIso`.
 * Pure integer arithmetic: no Date object time-zone or clock dependencies.
 */
export function calculateAge(birthDateIso: string, referenceDateIso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateIso) || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDateIso)) {
    return 0;
  }

  const [bYear, bMonth, bDay] = birthDateIso.split('-').map(Number);
  const [rYear, rMonth, rDay] = referenceDateIso.split('-').map(Number);

  if (!bYear || !bMonth || !bDay || !rYear || !rMonth || !rDay) return 0;

  let age = rYear - bYear;
  if (rMonth < bMonth || (rMonth === bMonth && rDay < bDay)) {
    age -= 1;
  }
  return age;
}

/**
 * Evaluates whether a question should be asked based on its `ask_when` conditions.
 * An empty `ask_when` list means "always ask".
 */
export function isQuestionVisible(
  question: Question,
  answers: Record<string, string>,
  context: QuestionFlowContext
): boolean {
  if (!question.ask_when || question.ask_when.length === 0) {
    return true;
  }

  const currentCustomerType =
    (answers.q_customer_type as CustomerType | undefined) ?? context.customerType;

  return question.ask_when.every((cond) => {
    let rawValue: unknown;

    if (cond.field === 'customer_type') {
      rawValue = currentCustomerType;
    } else if (cond.field === 'category') {
      rawValue = context.category;
    } else if (cond.field === 'financed_amount_cents') {
      rawValue = context.financedAmountCents;
    } else if (cond.field === 'term_months') {
      rawValue = context.termMonths;
    } else if (cond.field.startsWith('answers.')) {
      const qId = cond.field.slice('answers.'.length);
      rawValue = answers[qId];
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return false;
    }

    if (cond.op === 'in') {
      return cond.value.includes(String(rawValue));
    }
    if (cond.op === 'gte') {
      return Number(rawValue) >= cond.value;
    }
    if (cond.op === 'lte') {
      return Number(rawValue) <= cond.value;
    }

    return false;
  });
}

/**
 * Returns only the questions currently visible given the deal context and answers.
 */
export function getVisibleQuestions(
  questions: readonly Question[],
  answers: Record<string, string>,
  context: QuestionFlowContext
): Question[] {
  return questions.filter((q) => isQuestionVisible(q, answers, context));
}

/**
 * Drops answers that no longer apply when an earlier answer changes.
 * Iterates until no more stale answers are removed.
 */
export function pruneIrrelevantAnswers(
  questions: readonly Question[],
  answers: Record<string, string>,
  context: QuestionFlowContext
): Record<string, string> {
  const pruned = { ...answers };
  let changed = true;

  while (changed) {
    changed = false;
    for (const q of questions) {
      if (pruned[q.id] !== undefined && !isQuestionVisible(q, pruned, context)) {
        delete pruned[q.id];
        changed = true;
      }
    }
  }

  return pruned;
}

/**
 * Validates an individual question's answer against format rules and blocking criteria.
 */
export function validateQuestionAnswer(
  question: Question,
  value: string | undefined,
  context: QuestionFlowContext
): { valid: boolean; error?: string } {
  if (!value || value.trim() === '') {
    return { valid: true };
  }

  // Format validation (e.g. Finnish business ID)
  if (question.validation?.format === 'finnish_business_id') {
    if (!isValidFinnishBusinessId(value)) {
      return {
        valid: false,
        error: 'Invalid Finnish business ID (format must be 1234567-8 with a valid check digit)',
      };
    }
  }

  // Blocking criteria specified on the question
  if (question.blocks_application_when) {
    for (const block of question.blocks_application_when) {
      if (block.rule === 'age_under') {
        const age = calculateAge(value, context.todayIso);
        if (age < block.value) {
          return {
            valid: false,
            error: `Applicant must be at least ${block.value} years old (calculated age: ${age})`,
          };
        }
      }
      if (block.rule === 'answer_in') {
        if (block.value.includes(value)) {
          return {
            valid: false,
            error: `The answer "${value}" is not accepted for this lease`,
          };
        }
      }
    }
  }

  return { valid: true };
}

export type EligibilityStatus = 'approved' | 'rejected' | 'manual_review' | 'incomplete';

export type EligibilityReason = {
  ruleId: string;
  level: 'reject' | 'manual_review';
  message: string;
};

export type EligibilityEvaluation = {
  status: EligibilityStatus;
  reasons: EligibilityReason[];
};

/**
 * Evaluates the application against Northfina's eligibility rules:
 * - min_age: >= 18 on contract start date (consumers & sole traders)
 * - residency: FI, SE, EE only
 * - affordability: monthly rent incl. VAT <= 30% of monthly net income
 * - business_id: valid Finnish check digit (sole traders & companies)
 * - pep_manual_review: PEP goes to manual review
 * - financed_limits: fits coefficient-table band range (e.g. 30 000 cents to 25 000 000 cents)
 * - signatory: company applicant not allowed to sign goes to manual review
 *
 * NOTE: Only answers for CURRENTLY VISIBLE questions are evaluated.
 * Stale answers retained in draft UI state do NOT disqualify the applicant.
 */
export function evaluateEligibility(
  questions: readonly Question[],
  answers: Record<string, string>,
  context: QuestionFlowContext
): EligibilityEvaluation {
  const reasons: EligibilityReason[] = [];
  const visibleQuestions = getVisibleQuestions(questions, answers, context);
  const visibleIds = new Set(visibleQuestions.map((q) => q.id));

  // 1. Financed amount boundaries (derived from coefficient table limits)
  const minAllowed = context.minFinancedCents ?? 30000;
  const maxAllowed = context.maxFinancedCents ?? 25000000;

  if (context.financedAmountCents < minAllowed) {
    reasons.push({
      ruleId: 'financed_limits',
      level: 'reject',
      message: `Financed amount is below the minimum limit of €${(minAllowed / 100).toFixed(2)}.`,
    });
  } else if (context.financedAmountCents > maxAllowed) {
    reasons.push({
      ruleId: 'financed_limits',
      level: 'reject',
      message: `Financed amount exceeds the maximum limit of €${(maxAllowed / 100).toFixed(2)}.`,
    });
  }

  // 2. Age check (evaluated only when q_birth_date is visible)
  if (visibleIds.has('q_birth_date') && answers.q_birth_date) {
    const age = calculateAge(answers.q_birth_date, context.todayIso);
    if (age < 18) {
      reasons.push({
        ruleId: 'min_age',
        level: 'reject',
        message: 'Consumers and sole traders must be 18 or older on the contract start date.',
      });
    }
  }

  // 3. Residency check (evaluated only when q_country is visible)
  if (visibleIds.has('q_country') && answers.q_country) {
    if (!['FI', 'SE', 'EE'].includes(answers.q_country)) {
      reasons.push({
        ruleId: 'residency',
        level: 'reject',
        message: 'Country of residence must be Finland, Sweden, or Estonia.',
      });
    }
  }

  // 4. Affordability check (evaluated only when q_monthly_income is visible)
  if (visibleIds.has('q_monthly_income') && answers.q_monthly_income) {
    const rawIncome = Number(answers.q_monthly_income);
    const incomeCents = Math.round(rawIncome * 100);
    if (incomeCents > 0) {
      const maxAllowedRent = Math.floor(incomeCents * 0.3);
      if (context.monthlyRentInclVatCents > maxAllowedRent) {
        reasons.push({
          ruleId: 'affordability',
          level: 'reject',
          message: 'Monthly rent incl. VAT exceeds 30 % of monthly net income.',
        });
      }
    }
  }

  // 5. Business ID check (evaluated only when q_business_id is visible)
  if (visibleIds.has('q_business_id') && answers.q_business_id) {
    if (!isValidFinnishBusinessId(answers.q_business_id)) {
      reasons.push({
        ruleId: 'business_id',
        level: 'reject',
        message:
          'Sole traders and companies require a valid Finnish business ID with a correct check digit.',
      });
    }
  }

  // 6. PEP check (evaluated only when q_pep is visible)
  if (visibleIds.has('q_pep') && answers.q_pep === 'yes') {
    reasons.push({
      ruleId: 'pep_manual_review',
      level: 'manual_review',
      message:
        'Politically exposed person (PEP) status declared; compliance manual review required.',
    });
  }

  // 7. Signatory check for companies (evaluated only when q_can_sign is visible)
  if (visibleIds.has('q_can_sign') && answers.q_can_sign === 'no') {
    reasons.push({
      ruleId: 'signatory_authorization',
      level: 'manual_review',
      message:
        'Applicant is not authorized to sign; signature invitation will be sent to the authorized signatory.',
    });
  }

  // Determine overall status
  if (reasons.some((r) => r.level === 'reject')) {
    return { status: 'rejected', reasons };
  }
  if (reasons.some((r) => r.level === 'manual_review')) {
    return { status: 'manual_review', reasons };
  }

  // Check completeness across all visible questions
  const isComplete = visibleQuestions.every((q) => Boolean(answers[q.id]?.trim()));

  return {
    status: isComplete ? 'approved' : 'incomplete',
    reasons,
  };
}
