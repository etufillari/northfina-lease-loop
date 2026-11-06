import { describe, expect, it } from 'vitest';
import type { Question } from '@/data/schemas';
import { answersForSubmission, moneyInputText, wholeInput } from './form-values';

const questions: Question[] = [
  {
    id: 'q_income',
    type: 'money',
    ask_when: [],
    text: { en: 'Income', fi: 'Tulot', sv: 'Inkomst', et: 'Sissetulek' },
    why_we_ask: { en: 'Affordability' },
  },
];

describe('editing text and wire values', () => {
  it.each([
    ['1', 100],
    ['1.0', 100],
    ['1.05', 105],
    ['1,05', 105],
    ['0', 0],
    ['0.01', 1],
  ])('preserves %s while sending %s cents', (raw, cents) => {
    const input = { q_income: raw };
    expect(moneyInputText(raw)).toBe(raw);
    expect(answersForSubmission(questions, input)).toEqual({ q_income: cents });
    expect(input.q_income).toBe(raw);
  });
  it.each(['', '1.', '1,', '1.001', '-1', '1e3'])('does not turn invalid %s into zero', (raw) => {
    expect(answersForSubmission(questions, { q_income: raw }).q_income).toBe(raw);
  });
  it('displays numeric prefill exactly and does not re-interpret cents as euros', () => {
    expect(moneyInputText(105)).toBe('1.05');
    expect(moneyInputText(0)).toBe('0.00');
    expect(moneyInputText(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
    expect(answersForSubmission(questions, { q_income: 105 }).q_income).toBe(105);
  });
  it('does not mutate or retain mutable list references', () => {
    const input = { q_income: '1.0', q_owners: ['A'] };
    const output = answersForSubmission(questions, input);
    expect(output.q_owners).not.toBe(input.q_owners);
    expect(input).toEqual({ q_income: '1.0', q_owners: ['A'] });
  });
});

describe('physical meter entry', () => {
  it.each(['', ' ', '-1', '1.1', '1e3', 'Infinity', '2147483648'])(
    'rejects blank/non-integral/out-of-range %s',
    (raw) => expect(wholeInput(raw)).toBeNull()
  );
  it('distinguishes a real zero from absence and enforces the existing meter', () => {
    expect(wholeInput('0')).toBe(0);
    expect(wholeInput('99', 100)).toBeNull();
    expect(wholeInput('100', 100)).toBe(100);
    expect(wholeInput('2147483647')).toBe(2147483647);
  });
});
