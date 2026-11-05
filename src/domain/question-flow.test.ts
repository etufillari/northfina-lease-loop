import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { AskWhenCondition, Question } from '@/data/schemas';
import {
  evaluateCondition,
  isAskable,
  pruneAnswers,
  visibleQuestions,
  type FlowContext,
  type FlowDeal,
} from './question-flow';

// Tests run against the real question bank, so they also catch a changed data file.
let questions: Question[];
beforeAll(async () => {
  questions = (await loadQuestions()).questions;
});

const ctx = (deal: FlowDeal, answers: FlowContext['answers'] = {}): FlowContext => ({
  deal,
  answers,
});
const ids = (list: Question[]) => list.map((q) => q.id);

describe('evaluateCondition', () => {
  const company: AskWhenCondition = { field: 'customer_type', op: 'in', value: ['company'] };

  it('matches `in` against a deal field', () => {
    expect(evaluateCondition(company, ctx({ customer_type: 'company' }))).toBe(true);
    expect(evaluateCondition(company, ctx({ customer_type: 'consumer' }))).toBe(false);
  });

  it('reads `answers.<id>` conditions from the answers', () => {
    const cond: AskWhenCondition = { field: 'answers.q_can_sign', op: 'in', value: ['no'] };
    expect(evaluateCondition(cond, ctx({}, { q_can_sign: 'no' }))).toBe(true);
    expect(evaluateCondition(cond, ctx({}, { q_can_sign: 'yes' }))).toBe(false);
  });

  it('fails when the value is not known yet', () => {
    expect(evaluateCondition(company, ctx({}))).toBe(false);
    const ans: AskWhenCondition = { field: 'answers.q_pep', op: 'in', value: ['yes'] };
    expect(evaluateCondition(ans, ctx({}))).toBe(false);
  });

  it('treats gte and lte as inclusive', () => {
    const gte: AskWhenCondition = { field: 'financed_amount_cents', op: 'gte', value: 1_000_000 };
    const lte: AskWhenCondition = { field: 'financed_amount_cents', op: 'lte', value: 1_000_000 };
    expect(evaluateCondition(gte, ctx({ financed_amount_cents: 999_999 }))).toBe(false);
    expect(evaluateCondition(gte, ctx({ financed_amount_cents: 1_000_000 }))).toBe(true);
    expect(evaluateCondition(lte, ctx({ financed_amount_cents: 1_000_000 }))).toBe(true);
    expect(evaluateCondition(lte, ctx({ financed_amount_cents: 1_000_001 }))).toBe(false);
  });

  it('does not compare text with gte / lte', () => {
    const gte: AskWhenCondition = { field: 'answers.q_country', op: 'gte', value: 1 };
    expect(evaluateCondition(gte, ctx({}, { q_country: 'FI' }))).toBe(false);
  });

  it('matches numbers in `in` as text', () => {
    const cond: AskWhenCondition = { field: 'term_months', op: 'in', value: ['24', '36'] };
    expect(evaluateCondition(cond, ctx({ term_months: 24 }))).toBe(true);
    expect(evaluateCondition(cond, ctx({ term_months: 12 }))).toBe(false);
  });

  it('accepts zero as a known value', () => {
    const lte: AskWhenCondition = { field: 'financed_amount_cents', op: 'lte', value: 0 };
    expect(evaluateCondition(lte, ctx({ financed_amount_cents: 0 }))).toBe(true);
  });
});

describe('isAskable', () => {
  it('always asks a question with no conditions', () => {
    const q = questions.find((x) => x.id === 'q_customer_type')!;
    expect(isAskable(q, ctx({}))).toBe(true);
  });

  it('needs every condition to hold', () => {
    const q = questions.find((x) => x.id === 'q_monthly_income')!; // consumer AND >= 2000 €
    expect(isAskable(q, ctx({ customer_type: 'consumer', financed_amount_cents: 199_999 }))).toBe(
      false
    );
    expect(isAskable(q, ctx({ customer_type: 'consumer', financed_amount_cents: 200_000 }))).toBe(
      true
    );
    expect(isAskable(q, ctx({ customer_type: 'company', financed_amount_cents: 200_000 }))).toBe(
      false
    );
  });
});

describe('visibleQuestions', () => {
  it('shows only the always-asked questions before the customer type is known', () => {
    expect(ids(visibleQuestions(questions, ctx({})))).toEqual(['q_customer_type', 'q_email']);
  });

  it('asks a small consumer e-bike deal only what applies to it', () => {
    const deal = { customer_type: 'consumer', category: 'e_bike', financed_amount_cents: 189_900 };
    expect(ids(visibleQuestions(questions, ctx(deal)))).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_usage_purpose',
    ]);
  });

  it('adds the income question for a consumer from 2 000 € financed', () => {
    const deal = { customer_type: 'consumer', category: 'laptop', financed_amount_cents: 200_000 };
    expect(ids(visibleQuestions(questions, ctx(deal)))).toContain('q_monthly_income');
  });

  it('asks a company about the signatory only when the applicant cannot sign', () => {
    const deal = { customer_type: 'company', category: 'e_bike', financed_amount_cents: 400_000 };
    expect(ids(visibleQuestions(questions, ctx(deal, { q_can_sign: 'yes' })))).not.toContain(
      'q_signatory_email'
    );
    expect(ids(visibleQuestions(questions, ctx(deal, { q_can_sign: 'no' })))).toContain(
      'q_signatory_email'
    );
  });

  it('adds PEP, revenue and owner questions for a big company deal (card 7 shape)', () => {
    const deal = {
      customer_type: 'company',
      category: 'farm_machine',
      financed_amount_cents: 12_500_000,
      term_months: 48,
    };
    const shown = ids(visibleQuestions(questions, ctx(deal, { q_pep: 'yes' })));
    expect(shown).toEqual(
      expect.arrayContaining([
        'q_farm_registry',
        'q_annual_revenue',
        'q_beneficial_owners',
        'q_pep',
        'q_pep_details',
      ])
    );
  });

  it('ignores the stored answer of a question that is itself hidden', () => {
    // q_pep is hidden below 10 000 €, so its leftover "yes" must not reveal q_pep_details.
    const deal = { customer_type: 'consumer', category: 'laptop', financed_amount_cents: 500_000 };
    const shown = ids(visibleQuestions(questions, ctx(deal, { q_pep: 'yes' })));
    expect(shown).not.toContain('q_pep');
    expect(shown).not.toContain('q_pep_details');
  });

  it('hides consumer-only questions when the customer type changes to company', () => {
    const base = { category: 'laptop', financed_amount_cents: 300_000 };
    const answers = { q_employment: 'employed' };
    expect(
      ids(visibleQuestions(questions, ctx({ ...base, customer_type: 'consumer' }, answers)))
    ).toContain('q_employment');
    expect(
      ids(visibleQuestions(questions, ctx({ ...base, customer_type: 'company' }, answers)))
    ).not.toContain('q_employment');
  });

  it('keeps the order of the question bank', () => {
    const deal = {
      customer_type: 'company',
      category: 'farm_machine',
      financed_amount_cents: 6_000_000,
    };
    const order = questions.map((q) => q.id);
    const shown = ids(visibleQuestions(questions, ctx(deal)));
    expect(shown).toEqual(order.filter((id) => shown.includes(id)));
  });

  it('is deterministic and does not mutate its input', () => {
    const answers = Object.freeze({ q_can_sign: 'no' });
    const deal = Object.freeze({ customer_type: 'company', category: 'laptop' });
    const first = ids(visibleQuestions(questions, ctx(deal, answers)));
    expect(ids(visibleQuestions(questions, ctx(deal, answers)))).toEqual(first);
  });

  it('only lets a condition see earlier questions', () => {
    const a: Question = {
      ...questions[0]!,
      id: 'q_a',
      ask_when: [{ field: 'answers.q_b', op: 'in', value: ['x'] }],
    };
    const b: Question = { ...questions[0]!, id: 'q_b', ask_when: [] };
    expect(ids(visibleQuestions([a, b], ctx({}, { q_b: 'x' })))).toEqual(['q_b']);
  });
});

describe('pruneAnswers', () => {
  const consumer = {
    customer_type: 'consumer',
    category: 'laptop',
    financed_amount_cents: 500_000,
  };

  it('keeps everything when all answers still apply', () => {
    const answers = { q_customer_type: 'consumer', q_email: 'a@b.fi', q_employment: 'employed' };
    expect(pruneAnswers(questions, ctx(consumer, answers))).toEqual({ kept: answers, dropped: [] });
  });

  it('drops the signatory email when the applicant can sign after all', () => {
    const deal = { customer_type: 'company', category: 'laptop', financed_amount_cents: 400_000 };
    const result = pruneAnswers(
      questions,
      ctx(deal, { q_can_sign: 'yes', q_signatory_email: 'x@y.fi' })
    );
    expect(result).toEqual({ kept: { q_can_sign: 'yes' }, dropped: ['q_signatory_email'] });
  });

  it('cascades: a lower amount drops q_pep and q_pep_details together', () => {
    const answers = { q_pep: 'yes', q_pep_details: 'Minister', q_email: 'a@b.fi' };
    const high = { ...consumer, financed_amount_cents: 1_000_000 };
    expect(pruneAnswers(questions, ctx(high, answers)).dropped).toEqual([]);
    expect(pruneAnswers(questions, ctx(consumer, answers))).toEqual({
      kept: { q_email: 'a@b.fi' },
      dropped: ['q_pep', 'q_pep_details'],
    });
  });

  it('drops consumer-only answers when the customer type changes to company', () => {
    const answers = { q_full_name: 'Aino', q_birth_date: '1990-01-01', q_email: 'a@b.fi' };
    const result = pruneAnswers(questions, ctx({ ...consumer, customer_type: 'company' }, answers));
    expect(result).toEqual({
      kept: { q_email: 'a@b.fi' },
      dropped: ['q_full_name', 'q_birth_date'],
    });
  });

  it('drops unknown ids and ignores unanswered entries', () => {
    const result = pruneAnswers(questions, ctx(consumer, { q_nope: 'x', q_email: undefined }));
    expect(result).toEqual({ kept: {}, dropped: ['q_nope'] });
  });

  it('does not mutate the answers it receives', () => {
    const answers = Object.freeze({ q_pep: 'yes' });
    expect(() => pruneAnswers(questions, ctx(consumer, answers))).not.toThrow();
  });
});
