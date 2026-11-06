// Which application questions apply to a deal, given the answers so far. data/questions.json
// holds the rules; this file only reads them, so a new question needs no code.
import type { Answers, AnswerValue } from '@/data/lease-schemas';
import type { AskWhenCondition, AssetCategory, Customer, Question } from '@/data/schemas';
import { isIsoDate } from '../dates';
import { ageOn, eligibleFrom } from './age';

type CustomerType = Customer['type'];

export type Deal = {
  /** `undefined` until "Who is leasing?" is answered: questions that depend on it stay hidden. */
  customer_type: CustomerType | undefined;
  category: AssetCategory;
  financed_amount_cents: number;
  term_months: number;
};

const ANSWER_FIELD_PREFIX = 'answers.';

/** Who is leasing, from the q_customer_type answer. */
export function answeredCustomerType(answers: Answers): CustomerType | undefined {
  const value = answers.q_customer_type;
  return value === 'consumer' || value === 'sole_trader' || value === 'company' ? value : undefined;
}

function fieldValue(field: string, deal: Deal, answers: Answers): AnswerValue | undefined {
  switch (field) {
    case 'customer_type':
    case 'category':
    case 'financed_amount_cents':
    case 'term_months':
      return deal[field];
    default:
      return answers[field.slice(ANSWER_FIELD_PREFIX.length)];
  }
}

function conditionHolds(condition: AskWhenCondition, deal: Deal, answers: Answers): boolean {
  const value = fieldValue(condition.field, deal, answers);
  switch (condition.op) {
    case 'in':
      return typeof value === 'string' && condition.value.includes(value);
    case 'gte':
      return typeof value === 'number' && value >= condition.value;
    case 'lte':
      return typeof value === 'number' && value <= condition.value;
  }
}

function questionApplies(question: Question, deal: Deal, answers: Answers): boolean {
  return question.ask_when.every((condition) => conditionHolds(condition, deal, answers));
}

export type QuestionFlow = {
  /** Every question that applies now, in the order of the data file. */
  questions: Question[];
  /** The applicable questions still waiting for an answer. */
  unanswered: Question[];
  /** The answers that still count. Save these, not the ones sent in. */
  answers: Answers;
  /** Ids of the answers removed because their question no longer applies. */
  dropped: string[];
};

/**
 * Works out the questions for a deal and removes answers to questions that no longer apply.
 * Removing an answer can hide another question (q_can_sign → q_signatory_email), so this
 * repeats until nothing changes. It always ends, because each round can only remove answers.
 * Call it again with all answers after every change; it keeps no state of its own.
 */
export function questionsToAsk(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): QuestionFlow {
  let kept = answers;
  let applicable = questions.filter((question) => questionApplies(question, deal, kept));

  for (;;) {
    const applicableIds = new Set(applicable.map((question) => question.id));
    const next = Object.fromEntries(
      Object.entries(kept).filter(([questionId]) => applicableIds.has(questionId))
    );
    if (Object.keys(next).length === Object.keys(kept).length) break;
    kept = next;
    applicable = questions.filter((question) => questionApplies(question, deal, kept));
  }

  return {
    questions: applicable,
    unanswered: applicable.filter((question) => kept[question.id] === undefined),
    answers: kept,
    dropped: Object.keys(answers).filter((questionId) => kept[questionId] === undefined),
  };
}

export type AnswerError = {
  question_id: string;
  reason: 'empty' | 'not_an_option' | 'not_a_date' | 'not_an_email' | 'not_cents' | 'not_a_list';
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rejects shapes and also days that do not exist, such as 2026-02-30. */
function isRealDate(value: string): boolean {
  if (!isIsoDate(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function answerProblem(question: Question, value: AnswerValue): AnswerError['reason'] | null {
  switch (question.type) {
    case 'choice':
      return typeof value === 'string' && question.options?.includes(value)
        ? null
        : 'not_an_option';
    case 'text':
      return typeof value === 'string' && value.trim() !== '' ? null : 'empty';
    case 'date':
      return typeof value === 'string' && isRealDate(value) ? null : 'not_a_date';
    case 'email':
      return typeof value === 'string' && EMAIL.test(value) ? null : 'not_an_email';
    case 'money':
      return Number.isInteger(value) && Number(value) >= 0 ? null : 'not_cents';
    case 'list':
      return Array.isArray(value) && value.length > 0 && value.every((item) => item.trim() !== '')
        ? null
        : 'not_a_list';
  }
}

/**
 * Checks that each answer fits its question's type. Whether the answer passes a business
 * rule, such as the business ID check digit, is decided in eligibility, not here.
 */
export function invalidAnswers(questions: readonly Question[], answers: Answers): AnswerError[] {
  return questions.flatMap((question) => {
    const value = answers[question.id];
    if (value === undefined) return [];
    const reason = answerProblem(question, value);
    return reason === null ? [] : [{ question_id: question.id, reason }];
  });
}

export type BlockingAnswer =
  | { question_id: string; rule: 'age_under'; min_age: number }
  | { question_id: string; rule: 'answer_in' };

/** Why the form stopped asking, as the screen needs it. */
export type Blocked = { reason: 'min_age' | 'residency'; eligible_from: string | null };

/** Says why an answer blocked the application, and when a too-young applicant can try again. */
export function toBlocked(block: BlockingAnswer | null, answers: Answers): Blocked | null {
  if (block === null) return null;
  if (block.rule === 'age_under') {
    const birthDate = answers[block.question_id];
    return {
      reason: 'min_age',
      eligible_from: typeof birthDate === 'string' ? eligibleFrom(birthDate, block.min_age) : null,
    };
  }
  // The only `answer_in` rule in the data is the country question.
  return { reason: 'residency', eligible_from: null };
}

/**
 * The first answer that stops the application, so the form can stop asking and say why.
 * Pass only the questions that apply. Age is judged on `onDate`, the planned contract start.
 * A date that is not real is skipped here, because `invalidAnswers` reports it.
 */
export function blockingAnswer(
  questions: readonly Question[],
  answers: Answers,
  onDate: string
): BlockingAnswer | null {
  for (const question of questions) {
    const value = answers[question.id];
    if (typeof value !== 'string') continue;

    for (const block of question.blocks_application_when ?? []) {
      if (block.rule === 'answer_in' && block.value.includes(value)) {
        return { question_id: question.id, rule: 'answer_in' };
      }
      if (block.rule === 'age_under' && isRealDate(value) && ageOn(value, onDate) < block.value) {
        return { question_id: question.id, rule: 'age_under', min_age: block.value };
      }
    }
  }
  return null;
}
