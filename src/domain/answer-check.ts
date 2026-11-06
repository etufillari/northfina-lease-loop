// Is an answer the right SHAPE for its question? The form only offers valid answers, but
// the API accepts whatever is sent, and a choice nobody offered ("DE", "office") or a money
// amount typed as text would otherwise reach the eligibility rules. Content rules (age,
// residency, business-ID check digit) stay where they are: this only checks the shape.
import type { Question } from '@/data/schemas';
import { isIsoDate } from './calendar';

export type AnswerCheck = { ok: true } | { ok: false; reason: AnswerProblem };
export type AnswerProblem =
  | 'not_an_option'
  | 'empty_text'
  | 'text_too_long'
  | 'bad_email'
  | 'bad_money'
  | 'bad_date'
  | 'bad_list';

/** Longest free-text answer kept (a name, a farm registry number, PEP details). */
export const MAX_TEXT_LENGTH = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkAnswer(
  question: Pick<Question, 'type' | 'options'>,
  answer: unknown
): AnswerCheck {
  const fail = (reason: AnswerProblem): AnswerCheck => ({ ok: false, reason });
  switch (question.type) {
    case 'choice':
      return typeof answer === 'string' && (question.options ?? []).includes(answer)
        ? { ok: true }
        : fail('not_an_option');
    case 'text': {
      if (typeof answer !== 'string' || answer.trim() === '') return fail('empty_text');
      return answer.length > MAX_TEXT_LENGTH ? fail('text_too_long') : { ok: true };
    }
    case 'email':
      return typeof answer === 'string' && EMAIL.test(answer.trim())
        ? { ok: true }
        : fail('bad_email');
    case 'money':
      // Integer euro cents, never negative (RULES.md: money is integer cents).
      return typeof answer === 'number' && Number.isInteger(answer) && answer >= 0
        ? { ok: true }
        : fail('bad_money');
    case 'date':
      return typeof answer === 'string' && isIsoDate(answer) ? { ok: true } : fail('bad_date');
    case 'list':
      return Array.isArray(answer) &&
        answer.length > 0 &&
        answer.every(
          (item) => typeof item === 'string' && item.trim() !== '' && item.length <= MAX_TEXT_LENGTH
        )
        ? { ok: true }
        : fail('bad_list');
    default:
      return { ok: true };
  }
}
