// The application form as rules (Smart Problem 4). Which questions apply depends on the deal
// (category, financed amount, term) and on earlier answers. Answers are kept per question id;
// an answer whose question no longer applies is ignored and dropped, never evaluated (D-022).
import type { AskWhenCondition, AssetCategory, Question } from '@/data/schemas';
import { isValidBusinessId } from './business-id';
import { isIsoDate } from './calendar';

/** What the questions can depend on, besides the answers. Moves with the price sliders. */
export interface Deal {
  category: AssetCategory;
  financedAmountCents: number;
  termMonths: number;
}

export type AnswerValue = string | number | readonly string[];
export type Answers = Readonly<Record<string, AnswerValue>>;

export type AnswerCheck =
  | { ok: true; value: AnswerValue }
  | {
      ok: false;
      reason:
        | 'required'
        | 'not_an_option'
        | 'invalid_date'
        | 'invalid_email'
        | 'invalid_money'
        | 'invalid_business_id';
    };

/**
 * The questions that apply, in the bank's order. One pass is enough because a question only
 * depends on earlier ones (pinned by a test). A condition on an answer counts only if that
 * answer's question applies too, so a stale answer can never switch a question on.
 */
export function askedQuestions(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): Question[] {
  const asked: Question[] = [];
  const live = new Map<string, AnswerValue>();
  for (const question of questions) {
    if (question.ask_when.every((condition) => holds(condition, deal, live))) {
      asked.push(question);
      const answer = answers[question.id];
      if (answer !== undefined) live.set(question.id, answer);
    }
  }
  return asked;
}

/** The first question that applies and has no answer yet; null when the form is complete. */
export function nextQuestion(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): Question | null {
  return askedQuestions(questions, deal, answers).find((q) => answers[q.id] === undefined) ?? null;
}

/** Keeps the answers whose questions still apply and lists the ids it dropped, in input order. */
export function relevantAnswers(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): { answers: Answers; dropped: string[] } {
  const applies = new Set(askedQuestions(questions, deal, answers).map((q) => q.id));
  const kept: Record<string, AnswerValue> = {};
  const dropped: string[] = [];
  for (const [id, value] of Object.entries(answers)) {
    if (applies.has(id)) kept[id] = value;
    else dropped.push(id);
  }
  return { answers: kept, dropped };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks and normalises one answer for its question type. Money answers are whole cents. */
export function validateAnswer(question: Question, value: unknown): AnswerCheck {
  if (question.type === 'money') {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? { ok: true, value }
      : { ok: false, reason: 'invalid_money' };
  }
  if (question.type === 'list') {
    if (!Array.isArray(value)) return { ok: false, reason: 'required' };
    const items = value.map((item) => String(item).trim()).filter((item) => item !== '');
    return items.length > 0 ? { ok: true, value: items } : { ok: false, reason: 'required' };
  }

  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return { ok: false, reason: 'required' };
  if (question.options && !question.options.includes(text)) {
    return { ok: false, reason: 'not_an_option' };
  }
  if (question.type === 'date' && !isIsoDate(text)) return { ok: false, reason: 'invalid_date' };
  if (question.type === 'email' && !EMAIL.test(text)) return { ok: false, reason: 'invalid_email' };
  if (question.validation?.format === 'finnish_business_id' && !isValidBusinessId(text)) {
    return { ok: false, reason: 'invalid_business_id' };
  }
  return { ok: true, value: text };
}

function holds(condition: AskWhenCondition, deal: Deal, live: Map<string, AnswerValue>): boolean {
  const actual = fieldValue(condition.field, deal, live);
  if (actual === undefined) return false;
  switch (condition.op) {
    case 'in':
      return typeof actual === 'string' && condition.value.includes(actual);
    case 'gte':
      return typeof actual === 'number' && actual >= condition.value;
    case 'lte':
      return typeof actual === 'number' && actual <= condition.value;
  }
}

function fieldValue(
  field: string,
  deal: Deal,
  live: Map<string, AnswerValue>
): AnswerValue | undefined {
  switch (field) {
    case 'customer_type':
      return live.get('q_customer_type');
    case 'category':
      return deal.category;
    case 'financed_amount_cents':
      return deal.financedAmountCents;
    case 'term_months':
      return deal.termMonths;
    default:
      return live.get(field.slice('answers.'.length));
  }
}
