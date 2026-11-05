// Smart Problem 4: the question flow. Decides which questions of data/questions.json apply.
// Pruning stale answers and the eligibility decision build on this file.
import type { AskWhenCondition, Question } from '@/data/schemas';

/** An answer as the form delivers it: text for choices, a number for money (whole cents). */
export type AnswerValue = string | number;

/** The deal fields a condition can look at. Fields not known yet are left out. */
export type FlowDeal = {
  customer_type?: string;
  category?: string;
  financed_amount_cents?: number;
  term_months?: number;
};

export type FlowContext = {
  deal: FlowDeal;
  /** Answers by question id, for example `q_can_sign`. */
  answers: Readonly<Record<string, AnswerValue | undefined>>;
};

const ANSWER_PREFIX = 'answers.';

function resolveField(field: string, ctx: FlowContext): AnswerValue | undefined {
  if (field.startsWith(ANSWER_PREFIX)) return ctx.answers[field.slice(ANSWER_PREFIX.length)];
  return ctx.deal[field as keyof FlowDeal];
}

/**
 * Does one `ask_when` condition hold?
 *
 * A value that is not known yet (unanswered question, deal field not chosen) never satisfies a
 * condition, so questions that depend on it stay hidden until it exists.
 * `gte` / `lte` only compare numbers; a text value is "not comparable" and fails.
 * `in` compares as text, so `term_months in ["24"]` matches the number 24.
 */
export function evaluateCondition(condition: AskWhenCondition, ctx: FlowContext): boolean {
  const actual = resolveField(condition.field, ctx);
  if (actual === undefined) return false;

  switch (condition.op) {
    case 'in':
      return condition.value.includes(String(actual));
    case 'gte':
      return typeof actual === 'number' && actual >= condition.value;
    case 'lte':
      return typeof actual === 'number' && actual <= condition.value;
  }
}

/** All conditions must hold. An empty list means "always ask". */
export function isAskable(question: Question, ctx: FlowContext): boolean {
  return question.ask_when.every((condition) => evaluateCondition(condition, ctx));
}

/**
 * The questions that apply, in the order of `questions`.
 *
 * A question counts as an answer source only while it is itself visible: its stored answer is
 * ignored when its own conditions fail. So if `q_pep` is hidden, a leftover `q_pep = "yes"`
 * does not make `q_pep_details` appear. Conditions look at earlier questions, so one pass in
 * file order is enough; a condition on a later question sees no answer and fails.
 */
export function visibleQuestions(questions: readonly Question[], ctx: FlowContext): Question[] {
  const effectiveAnswers: Record<string, AnswerValue | undefined> = {};
  const visible: Question[] = [];

  for (const question of questions) {
    if (!isAskable(question, { deal: ctx.deal, answers: effectiveAnswers })) continue;
    visible.push(question);
    effectiveAnswers[question.id] = ctx.answers[question.id];
  }
  return visible;
}

export type PruneResult = {
  /** The answers that still apply. */
  kept: Record<string, AnswerValue>;
  /** Ids whose answers were removed, so the UI can say what changed. */
  dropped: string[];
};

/**
 * Removes the answers that no longer apply after the customer changed an earlier answer or the
 * deal (amount, term, customer type). Run it after every change.
 *
 * No loop is needed: `visibleQuestions` already ignores the answer of a hidden question, so
 * a cascade (amount drops, `q_pep` hides, `q_pep_details` hides with it) resolves in one pass.
 * Answers for ids that are not in the question bank are dropped too. Unanswered
 * (`undefined`) entries are neither kept nor reported.
 */
export function pruneAnswers(questions: readonly Question[], ctx: FlowContext): PruneResult {
  const visible = new Set(visibleQuestions(questions, ctx).map((q) => q.id));
  const kept: Record<string, AnswerValue> = {};
  const dropped: string[] = [];

  for (const [id, value] of Object.entries(ctx.answers)) {
    if (value === undefined) continue;
    if (visible.has(id)) kept[id] = value;
    else dropped.push(id);
  }
  return { kept, dropped };
}
