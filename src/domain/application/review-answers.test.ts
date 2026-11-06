import { describe, expect, it } from 'vitest';
import type { Question } from '@/data/schemas';
import { reviewAnswers } from './review-answers';

const question = (id: string, english: string): Question => ({
  id,
  type: 'text',
  text: { en: english, fi: `${english} (fi)`, sv: `${english} (sv)`, et: `${english} (et)` },
  why_we_ask: { en: 'test' },
  ask_when: [],
});

const questions = [
  question('q_first', 'First'),
  question('q_second', 'Second'),
  question('q_third', 'Third'),
];

describe('reviewAnswers', () => {
  it('keeps the order of the questions, not of the answers', () => {
    const rows = reviewAnswers(questions, { q_third: 'c', q_first: 'a' }, 'en');
    expect(rows).toEqual([
      { id: 'q_first', text: 'First', value: 'a' },
      { id: 'q_third', text: 'Third', value: 'c' },
    ]);
  });

  it('gives the question in the language asked for', () => {
    expect(reviewAnswers(questions, { q_first: 'a' }, 'fi')[0]?.text).toBe('First (fi)');
  });

  it('leaves out an answer to a question that no longer exists', () => {
    expect(reviewAnswers(questions, { q_gone: 'x' }, 'en')).toEqual([]);
  });

  it('keeps a zero, which is an answer', () => {
    expect(reviewAnswers(questions, { q_first: 0 }, 'en')[0]?.value).toBe(0);
  });

  it('gives nothing for no answers', () => {
    expect(reviewAnswers(questions, {}, 'en')).toEqual([]);
  });
});
