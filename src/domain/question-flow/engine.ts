// The question-flow engine: which questions of data/questions.json to ask, in what order, and
// what happens to earlier answers when one changes. Pure: the bank, the deal and the answers
// come in as arguments (CHALLENGE.md smart problem 4, data/DATA.md "Rules for ask_when").
import type { AskWhenCondition, Question } from '@/data/schemas';

/** The deal the questions are targeted at. The caller builds it from the quote and customer. */
export type FlowContext = {
  customerType: string;
  category: string;
  financedCents: number;
  termMonths: number;
};

/** Question id → answer. Money answers are integer cents as digits; list answers are arrays. */
export type Answer = string | readonly string[];
export type Answers = Readonly<Record<string, Answer>>;

export type FlowLocale = 'en' | 'fi' | 'sv' | 'et';

/**
 * The value a condition field looks at. `customer_type` is the applicant's own answer to
 * `q_customer_type` once given (so changing it re-targets the flow), the context's before.
 * An unanswered question is `undefined`, and no condition on it holds.
 */
function fieldValue(field: string, context: FlowContext, answers: Answers): unknown {
  switch (field) {
    case 'customer_type':
      return answers.q_customer_type ?? context.customerType;
    case 'category':
      return context.category;
    case 'financed_amount_cents':
      return context.financedCents;
    case 'term_months':
      return context.termMonths;
    default:
      return field.startsWith('answers.') ? answers[field.slice('answers.'.length)] : undefined;
  }
}

/** One `ask_when` condition. `in` on a list answer holds when any item is in the list. */
export function conditionHolds(
  condition: AskWhenCondition,
  context: FlowContext,
  answers: Answers
): boolean {
  const value = fieldValue(condition.field, context, answers);
  if (value === undefined) return false;
  if (condition.op === 'in') {
    const values = Array.isArray(value) ? value : [value];
    return values.some((v) => condition.value.includes(String(v)));
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+$/.test(value))) {
    return false;
  }
  return condition.op === 'gte' ? n >= condition.value : n <= condition.value;
}

/** True when every condition holds; an empty `ask_when` always holds. */
export function isVisible(question: Question, context: FlowContext, answers: Answers): boolean {
  return question.ask_when.every((condition) => conditionHolds(condition, context, answers));
}

/** The questions to ask for this deal and these answers, in the bank's order. */
export function visibleQuestions(
  bank: readonly Question[],
  context: FlowContext,
  answers: Answers
): Question[] {
  return bank.filter((question) => isVisible(question, context, answers));
}

function isAnswered(answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  return typeof answer === 'string' ? answer.trim() !== '' : answer.length > 0;
}

/** The first visible question without an answer, or null when the flow is complete. */
export function nextQuestion(
  bank: readonly Question[],
  context: FlowContext,
  answers: Answers
): Question | null {
  return visibleQuestions(bank, context, answers).find((q) => !isAnswered(answers[q.id])) ?? null;
}

/** Every visible question has an answer. */
export function isComplete(bank: readonly Question[], context: FlowContext, answers: Answers) {
  return nextQuestion(bank, context, answers) === null;
}

/**
 * Drops the answers to questions that are not visible any more, for example the signatory's
 * e-mail once "can you sign?" changes from no to yes. Dropping one answer can hide another
 * question, so it repeats until nothing changes; each round removes at least one answer, so
 * it ends after at most one round per answer.
 */
export function pruneAnswers(
  bank: readonly Question[],
  context: FlowContext,
  answers: Answers
): Record<string, Answer> {
  let current: Record<string, Answer> = { ...answers };
  for (let round = 0; round <= Object.keys(answers).length; round++) {
    const visible = new Set(visibleQuestions(bank, context, current).map((q) => q.id));
    const kept = Object.fromEntries(Object.entries(current).filter(([id]) => visible.has(id)));
    if (Object.keys(kept).length === Object.keys(current).length) return kept;
    current = kept;
  }
  return current;
}

/** The bank's "why we ask" text in the locale, or the English one when it has no translation. */
export function whyWeAsk(question: Question, locale: FlowLocale): string {
  return question.why_we_ask[locale] ?? question.why_we_ask.en;
}
