import { expect, it } from 'vitest';
import type { Question } from '@/data/schemas';
import { normaliseAnswers } from './question-flow';

it('returns the final active set after a reverse-ordered dependent-answer cascade', () => {
  const make = (id: string, ask_when: Question['ask_when']): Question => ({
    id,
    type: 'choice',
    options: ['yes', 'no'],
    ask_when,
    text: { en: id, fi: id, sv: id, et: id },
    why_we_ask: { en: 'Synthetic dependency test' },
  });
  const questions = [
    make('q_third', [{ field: 'answers.q_second', op: 'in', value: ['yes'] }]),
    make('q_second', [{ field: 'answers.q_first', op: 'in', value: ['yes'] }]),
    make('q_first', [{ field: 'financed_amount_cents', op: 'gte', value: 1000000 }]),
  ];
  const answers = { q_first: 'yes', q_second: 'yes', q_third: 'yes' };
  const result = normaliseAnswers(
    questions,
    {
      customer_type: 'consumer',
      category: 'e_bike',
      financed_amount_cents: 389000,
      term_months: 36,
    },
    answers
  );
  expect(result).toEqual({
    answers: {},
    activeQuestions: [],
    removedIds: ['q_first', 'q_second', 'q_third'],
    invalidIds: [],
    missingIds: [],
  });
  expect(answers).toEqual({ q_first: 'yes', q_second: 'yes', q_third: 'yes' });
});
