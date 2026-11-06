// What a reviewer reads: each answer next to the question it answers, in the order the customer
// saw them. A question with no answer is left out, and so is an answer to no known question.
import type { AnswerValue, Answers } from '@/data/lease-schemas';
import type { Question } from '@/data/schemas';
import type { Locale } from '@/i18n/locales';

export type ReviewAnswer = { id: string; text: string; value: AnswerValue };

export function reviewAnswers(
  questions: readonly Question[],
  answers: Answers,
  locale: Locale
): ReviewAnswer[] {
  return questions.flatMap((question) => {
    const value = answers[question.id];
    if (value === undefined) return [];
    return [{ id: question.id, text: question.text[locale], value }];
  });
}
