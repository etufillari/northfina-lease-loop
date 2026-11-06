import type { Question } from '@/data/schemas';
export type QuestionFacts = {
  customerType: string;
  category: string;
  financedCents: number;
  termMonths: number;
};
/** All predicates must apply; absent prerequisite answers never satisfy numeric conditions. */
export function applicableQuestions(
  questions: readonly Question[],
  facts: QuestionFacts,
  answers: Readonly<Record<string, string>>
) {
  return questions.filter((question) =>
    question.ask_when.every((condition) => {
      const value = condition.field.startsWith('answers.')
        ? answers[condition.field.slice(8)]
        : condition.field === 'customer_type'
          ? facts.customerType
          : condition.field === 'category'
            ? facts.category
            : condition.field === 'term_months'
              ? facts.termMonths
              : facts.financedCents;
      return condition.op === 'in'
        ? condition.value.includes(String(value))
        : typeof value === 'number' &&
            (condition.op === 'gte' ? value >= condition.value : value <= condition.value);
    })
  );
}
/** Remove irrelevant answers to a fixed point when a previous answer changes. */
export function pruneQuestionAnswers(
  questions: readonly Question[],
  facts: QuestionFacts,
  input: Readonly<Record<string, string>>
) {
  let answers = { ...input };
  for (let i = 0; i <= questions.length; i++) {
    const ids = new Set(applicableQuestions(questions, facts, answers).map((q) => q.id));
    const next = Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
    if (Object.keys(next).length === Object.keys(answers).length) return next;
    answers = next;
  }
  return answers;
}
