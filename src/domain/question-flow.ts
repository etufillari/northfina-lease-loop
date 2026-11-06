// The smart question flow (Smart Problem 4): everything is driven by data/questions.json,
// nothing is hard-coded. A question is visible when all its ask_when conditions hold; the
// customer type itself is the answer to q_customer_type, so the flow is self-contained.
import type { AskWhenCondition, AssetCategory, Question } from '@/data/schemas';
import { birthdayAt, yearsOld } from './calendar';

export type AnswerValue = string | number | string[];
export type Answers = Record<string, AnswerValue>;

/** The deal the customer is applying for; the rest of the context lives in `answers`. */
export type DealContext = {
  category: AssetCategory;
  financedAmountCents: number;
  termMonths: number;
};

function fieldValue(
  field: AskWhenCondition['field'],
  deal: DealContext,
  answers: Answers
): AnswerValue | undefined {
  if (field === 'customer_type') return answers['q_customer_type'];
  if (field === 'category') return deal.category;
  if (field === 'financed_amount_cents') return deal.financedAmountCents;
  if (field === 'term_months') return deal.termMonths;
  return answers[field.slice('answers.'.length)];
}

function conditionHolds(condition: AskWhenCondition, deal: DealContext, answers: Answers): boolean {
  const value = fieldValue(condition.field, deal, answers);
  if (value === undefined) return false;
  if (condition.op === 'in') return condition.value.includes(String(value));
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return false;
  return condition.op === 'gte' ? numeric >= condition.value : numeric <= condition.value;
}

/** The questions that apply right now, in file order. An empty ask_when means always. */
export function visibleQuestions(
  questions: readonly Question[],
  deal: DealContext,
  answers: Answers
): Question[] {
  return questions.filter((q) => q.ask_when.every((c) => conditionHolds(c, deal, answers)));
}

/** The next unanswered visible question, or null when the form is complete. */
export function nextQuestion(
  questions: readonly Question[],
  deal: DealContext,
  answers: Answers
): Question | null {
  return (
    visibleQuestions(questions, deal, answers).find((q) => answers[q.id] === undefined) ?? null
  );
}

/**
 * Drops every answer whose question no longer applies — the "customer goes back and changes
 * an answer" rule. Visibility depends on answers, so removals can cascade (changing
 * q_can_sign to "yes" hides q_signatory_email, whose answer is then dropped); the loop runs
 * until nothing more falls out.
 */
export function pruneAnswers(
  questions: readonly Question[],
  deal: DealContext,
  answers: Answers
): Answers {
  let kept = { ...answers };
  for (;;) {
    const visibleIds = new Set(visibleQuestions(questions, deal, kept).map((q) => q.id));
    const next = Object.fromEntries(Object.entries(kept).filter(([id]) => visibleIds.has(id)));
    if (Object.keys(next).length === Object.keys(kept).length) return next;
    kept = next;
  }
}

export type BlockedAnswer = {
  questionId: string;
  rule: 'age_under' | 'answer_in';
  /** For age_under: the first date the applicant is old enough, for a kind decline. */
  eligibleFrom?: string;
};

/**
 * The first answered, visible question whose blocking rule fires, or null. Age is checked on
 * the contract start date (docs/DECISIONS.md), so `startDate` is an argument. Only blocking
 * rules stop the form; a PEP "yes" is manual review, not a block.
 */
export function firstBlockedAnswer(
  questions: readonly Question[],
  deal: DealContext,
  answers: Answers,
  startDate: string
): BlockedAnswer | null {
  for (const question of visibleQuestions(questions, deal, answers)) {
    const answer = answers[question.id];
    if (answer === undefined || !question.blocks_application_when) continue;
    for (const rule of question.blocks_application_when) {
      if (rule.rule === 'age_under') {
        const birthDate = String(answer);
        if (yearsOld(birthDate, startDate) < rule.value) {
          const eligibleFrom = birthdayAt(birthDate, rule.value);
          return { questionId: question.id, rule: 'age_under', eligibleFrom };
        }
      } else if (rule.value.includes(String(answer))) {
        return { questionId: question.id, rule: 'answer_in' };
      }
    }
  }
  return null;
}
