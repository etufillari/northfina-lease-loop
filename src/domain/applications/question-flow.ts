import {
  isoDateSchema,
  type AssetCategory,
  type Question,
  type QuestionsFile,
} from '@/data/schemas';

export type ApplicationAnswer = string | number | string[];
export type ApplicationAnswers = Readonly<Record<string, ApplicationAnswer | undefined>>;

export type QuestionFlowDeal = {
  category: AssetCategory;
  financedAmountCents: number;
  termMonths: number;
  customerType?: string;
};

export type QuestionFlowResult = {
  activeQuestions: Question[];
  retainedAnswers: ApplicationAnswers;
  discardedAnswerIds: string[];
  missingQuestionIds: string[];
  nextQuestionId: string | null;
};

export type ApplicationDecision = 'incomplete' | 'approved' | 'rejected' | 'manual_review';

export type EligibilityReasonCode =
  | 'age_under_minimum'
  | 'unsupported_residency'
  | 'unaffordable'
  | 'invalid_business_id'
  | 'not_authorized_signatory'
  | 'pep_manual_review';

export type EligibilityReason = {
  code: EligibilityReasonCode;
  questionId?: string;
};

export type ApplicationEvaluationInput = QuestionFlowDeal & {
  startDate: string;
  monthlyGrossRentCents: number;
  answers: ApplicationAnswers;
};

export type ApplicationEvaluation = {
  decision: ApplicationDecision;
  reasons: EligibilityReason[];
  questionFlow: QuestionFlowResult;
};

function answerIsPresent(answer: ApplicationAnswer | undefined): boolean {
  if (answer === undefined) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return Number.isFinite(answer);
}

function answerString(answers: ApplicationAnswers, questionId: string): string | undefined {
  const answer = answers[questionId];
  return typeof answer === 'string' ? answer : undefined;
}

function valueForCondition(
  field: string,
  deal: QuestionFlowDeal,
  answers: ApplicationAnswers
): ApplicationAnswer | undefined {
  if (field === 'customer_type') {
    return deal.customerType ?? answers.q_customer_type;
  }
  if (field === 'category') return deal.category;
  if (field === 'financed_amount_cents') return deal.financedAmountCents;
  if (field === 'term_months') return deal.termMonths;
  if (field.startsWith('answers.')) return answers[field.slice('answers.'.length)];
  return undefined;
}

function conditionMatches(
  condition: Question['ask_when'][number],
  deal: QuestionFlowDeal,
  answers: ApplicationAnswers
): boolean {
  const actual = valueForCondition(condition.field, deal, answers);

  if (condition.op === 'in') {
    return typeof actual === 'string' && condition.value.includes(actual);
  }
  if (typeof actual !== 'number') return false;
  return condition.op === 'gte' ? actual >= condition.value : actual <= condition.value;
}

function questionApplies(
  question: Question,
  deal: QuestionFlowDeal,
  answers: ApplicationAnswers
): boolean {
  return question.ask_when.every((condition) => conditionMatches(condition, deal, answers));
}

/**
 * Resolves the dynamic application form from the data pack.
 * Conditions are conjunctive: every ask_when condition must match. Answers to questions
 * that no longer apply are removed from the returned canonical answer set.
 */
export function questionFlowFor(
  questionsFile: QuestionsFile,
  deal: QuestionFlowDeal,
  answers: ApplicationAnswers
): QuestionFlowResult {
  const activeQuestions = questionsFile.questions.filter((question) =>
    questionApplies(question, deal, answers)
  );
  const activeIds = new Set(activeQuestions.map((question) => question.id));
  const retainedAnswers: Record<string, ApplicationAnswer> = {};
  const discardedAnswerIds: string[] = [];

  for (const [questionId, answer] of Object.entries(answers)) {
    if (answer === undefined) continue;
    if (activeIds.has(questionId)) retainedAnswers[questionId] = answer;
    else discardedAnswerIds.push(questionId);
  }

  const missingQuestionIds = activeQuestions
    .filter((question) => !answerIsPresent(retainedAnswers[question.id]))
    .map((question) => question.id);

  return {
    activeQuestions,
    retainedAnswers,
    discardedAnswerIds,
    missingQuestionIds,
    nextQuestionId: missingQuestionIds[0] ?? null,
  };
}

function ageOnDate(birthDate: string, date: string): number | undefined {
  if (!isoDateSchema.safeParse(birthDate).success) return undefined;
  let age = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (date.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

function hasValidFinnishBusinessId(value: string | undefined): boolean {
  if (!value || !/^\d{7}-\d$/.test(value)) return false;
  const digits = value.replace('-', '').split('').map(Number);
  const checkDigit = digits.pop();
  if (checkDigit === undefined) return false;

  const weightedSum = digits.reduce(
    (sum, digit, index) => sum + digit * [7, 9, 10, 5, 8, 4, 2][index]!,
    0
  );
  const remainder = weightedSum % 11;
  if (remainder === 1) return false;
  const expected = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit === expected;
}

function blockedReasons(
  input: ApplicationEvaluationInput,
  questionFlow: QuestionFlowResult
): EligibilityReason[] {
  const answers = questionFlow.retainedAnswers;
  const reasons: EligibilityReason[] = [];
  const birthDate = answerString(answers, 'q_birth_date');
  const age = birthDate ? ageOnDate(birthDate, input.startDate) : undefined;
  if (age !== undefined && age < 18) {
    reasons.push({ code: 'age_under_minimum', questionId: 'q_birth_date' });
  }

  const country = answerString(answers, 'q_country');
  if (country === 'other') reasons.push({ code: 'unsupported_residency', questionId: 'q_country' });

  const customerType = answerString(answers, 'q_customer_type');
  if (customerType === 'consumer') {
    const income = answers.q_monthly_income;
    if (typeof income === 'number' && input.monthlyGrossRentCents * 100 > income * 30) {
      reasons.push({ code: 'unaffordable', questionId: 'q_monthly_income' });
    }
  }

  if (customerType === 'sole_trader' || customerType === 'company') {
    const businessId = answerString(answers, 'q_business_id');
    if (businessId?.trim() && !hasValidFinnishBusinessId(businessId)) {
      reasons.push({ code: 'invalid_business_id', questionId: 'q_business_id' });
    }
  }

  if (customerType === 'company' && answerString(answers, 'q_can_sign') === 'no') {
    reasons.push({ code: 'not_authorized_signatory', questionId: 'q_can_sign' });
  }

  if (answerString(answers, 'q_pep') === 'yes') {
    reasons.push({ code: 'pep_manual_review', questionId: 'q_pep' });
  }

  return reasons;
}

/** Evaluates the rules described by questions.json after resolving the active form. */
export function evaluateApplication(
  questionsFile: QuestionsFile,
  input: ApplicationEvaluationInput
): ApplicationEvaluation {
  if (!isoDateSchema.safeParse(input.startDate).success) {
    throw new RangeError(`startDate must be a valid ISO date, got "${input.startDate}"`);
  }
  if (!Number.isInteger(input.monthlyGrossRentCents) || input.monthlyGrossRentCents < 0) {
    throw new RangeError(
      `monthlyGrossRentCents must be a non-negative whole number of cents, got ${input.monthlyGrossRentCents}`
    );
  }

  const questionFlow = questionFlowFor(questionsFile, input, input.answers);
  const reasons = blockedReasons(input, questionFlow);
  if (reasons.some((reason) => reason.code !== 'pep_manual_review')) {
    return {
      decision: 'rejected',
      reasons,
      questionFlow: { ...questionFlow, nextQuestionId: null },
    };
  }
  if (reasons.length > 0) return { decision: 'manual_review', reasons, questionFlow };
  if (questionFlow.missingQuestionIds.length > 0) {
    return { decision: 'incomplete', reasons: [], questionFlow };
  }
  return { decision: 'approved', reasons: [], questionFlow };
}
