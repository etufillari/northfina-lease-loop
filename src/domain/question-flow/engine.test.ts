import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { AskWhenCondition, Question } from '@/data/schemas';
import {
  conditionHolds,
  isComplete,
  nextQuestion,
  pruneAnswers,
  visibleQuestions,
  whyWeAsk,
  type FlowContext,
} from './engine';

// Tests run against the real question bank, so a changed data file shows up here.
let bank: Question[];
beforeAll(async () => {
  bank = (await loadQuestions()).questions;
});

const ids = (questions: readonly Question[]) => questions.map((q) => q.id);

/** Card 7: farm-002, 48 months, 2 000 000 down, financed 12 500 000. */
const card7: FlowContext = {
  customerType: 'company',
  category: 'farm_machine',
  financedCents: 12_500_000,
  termMonths: 48,
};
/** Card 6: one ebike-004 (every item is unique, D8), financed 549 000. */
const card6: FlowContext = {
  customerType: 'company',
  category: 'e_bike',
  financedCents: 549_000,
  termMonths: 36,
};
/** Card 1: ebike-003, 36 months, no down payment. */
const card1: FlowContext = {
  customerType: 'consumer',
  category: 'e_bike',
  financedCents: 389_000,
  termMonths: 36,
};

describe('conditionHolds (the ask_when rules of data/DATA.md)', () => {
  it('in: the value is one of the list', () => {
    const cond: AskWhenCondition = { field: 'customer_type', op: 'in', value: ['company'] };
    expect(conditionHolds(cond, card7, {})).toBe(true);
    expect(conditionHolds(cond, card1, {})).toBe(false);
  });

  it('gte and lte include the limit', () => {
    const at = { ...card1, financedCents: 1_000_000 };
    expect(
      conditionHolds({ field: 'financed_amount_cents', op: 'gte', value: 1_000_000 }, at, {})
    ).toBe(true);
    expect(
      conditionHolds(
        { field: 'financed_amount_cents', op: 'gte', value: 1_000_000 },
        { ...at, financedCents: 999_999 },
        {}
      )
    ).toBe(false);
    expect(conditionHolds({ field: 'term_months', op: 'lte', value: 36 }, card1, {})).toBe(true);
    expect(conditionHolds({ field: 'term_months', op: 'lte', value: 35 }, card1, {})).toBe(false);
  });

  it('an unanswered question never satisfies a condition on its answer', () => {
    const cond: AskWhenCondition = { field: 'answers.q_can_sign', op: 'in', value: ['no'] };
    expect(conditionHolds(cond, card6, {})).toBe(false);
    expect(conditionHolds(cond, card6, { q_can_sign: 'no' })).toBe(true);
  });

  it('a number op on a text answer is false, not a crash', () => {
    expect(
      conditionHolds({ field: 'answers.q_email', op: 'gte', value: 1 }, card1, { q_email: 'x' })
    ).toBe(false);
  });

  it('the customer type answer, once given, wins over the context', () => {
    const cond: AskWhenCondition = { field: 'customer_type', op: 'in', value: ['sole_trader'] };
    expect(conditionHolds(cond, card1, { q_customer_type: 'sole_trader' })).toBe(true);
  });
});

describe('visibleQuestions', () => {
  it('card 7: the company, farm registry, revenue, owners and PEP questions appear, in bank order', () => {
    const visible = ids(visibleQuestions(bank, card7, {}));
    expect(visible).toEqual([
      'q_customer_type',
      'q_email',
      'q_business_id',
      'q_company_name',
      'q_can_sign',
      'q_vat_registered',
      'q_farm_registry',
      'q_annual_revenue',
      'q_beneficial_owners',
      'q_pep',
    ]);
  });

  it('card 7: PEP details appear only after PEP = yes', () => {
    expect(ids(visibleQuestions(bank, card7, { q_pep: 'no' }))).not.toContain('q_pep_details');
    expect(ids(visibleQuestions(bank, card7, { q_pep: 'yes' }))).toContain('q_pep_details');
  });

  it('card 6: 549 000 asks no PEP, revenue or owners; the can-sign question appears', () => {
    const visible = ids(visibleQuestions(bank, card6, {}));
    expect(visible).toEqual([
      'q_customer_type',
      'q_email',
      'q_business_id',
      'q_company_name',
      'q_can_sign',
      'q_vat_registered',
      'q_usage_purpose',
    ]);
  });

  it('card 6: the signatory e-mail appears when the applicant cannot sign', () => {
    const visible = ids(visibleQuestions(bank, card6, { q_can_sign: 'no' }));
    expect(visible).toContain('q_signatory_email');
    expect(visible.indexOf('q_signatory_email')).toBe(visible.indexOf('q_can_sign') + 1);
  });

  it('card 1: only the consumer questions, with income (≥ 200 000) and without PEP', () => {
    expect(ids(visibleQuestions(bank, card1, {}))).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_monthly_income',
      'q_usage_purpose',
    ]);
  });

  it('a consumer below 200 000 financed is not asked for income', () => {
    const cheap = { ...card1, financedCents: 199_999 };
    expect(ids(visibleQuestions(bank, cheap, {}))).not.toContain('q_monthly_income');
  });

  it('an empty ask_when list means always ask', () => {
    const always = bank.filter((q) => q.ask_when.length === 0).map((q) => q.id);
    for (const context of [card1, card6, card7]) {
      expect(ids(visibleQuestions(bank, context, {}))).toEqual(expect.arrayContaining(always));
    }
  });
});

describe('nextQuestion', () => {
  it('is the first visible question without an answer', () => {
    expect(nextQuestion(bank, card1, {})?.id).toBe('q_customer_type');
    expect(nextQuestion(bank, card1, { q_customer_type: 'consumer' })?.id).toBe('q_full_name');
  });

  it('skips answered questions even out of order', () => {
    expect(
      nextQuestion(bank, card1, { q_customer_type: 'consumer', q_birth_date: '1997-04-12' })?.id
    ).toBe('q_full_name');
  });

  it('is null when every visible question is answered (isComplete)', () => {
    const answers: Record<string, string> = {};
    for (const q of visibleQuestions(bank, card1, {})) answers[q.id] = 'x';
    expect(nextQuestion(bank, card1, answers)).toBeNull();
    expect(isComplete(bank, card1, answers)).toBe(true);
    expect(isComplete(bank, card1, {})).toBe(false);
  });

  it('card 7: after PEP = yes the next question is PEP details', () => {
    const answers: Record<string, string> = {};
    for (const q of visibleQuestions(bank, card7, {})) answers[q.id] = 'x';
    answers.q_pep = 'yes';
    expect(nextQuestion(bank, card7, answers)?.id).toBe('q_pep_details');
  });
});

describe('pruneAnswers (going back and changing an answer)', () => {
  it('card 6: can-sign no → signatory named → changed to yes: the signatory answer goes', () => {
    const before = { q_can_sign: 'no', q_signatory_email: 'ceo@norvi.example.com' };
    expect(pruneAnswers(bank, card6, before)).toEqual(before);
    expect(pruneAnswers(bank, card6, { ...before, q_can_sign: 'yes' })).toEqual({
      q_can_sign: 'yes',
    });
  });

  it('card 7: PEP changed from yes to no drops the PEP details', () => {
    const answers = { q_pep: 'no', q_pep_details: 'MP since 2019' };
    expect(pruneAnswers(bank, card7, answers)).toEqual({ q_pep: 'no' });
  });

  it('changing the customer type drops every answer that no longer applies, in a chain', () => {
    const company = {
      q_customer_type: 'company',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_signatory_email: 'ceo@norvi.example.com',
      q_email: 'fleet@norvi.example.com',
    };
    expect(pruneAnswers(bank, card6, { ...company, q_customer_type: 'consumer' })).toEqual({
      q_customer_type: 'consumer',
      q_email: 'fleet@norvi.example.com',
    });
  });

  it('drops answers to ids the bank does not have', () => {
    expect(pruneAnswers(bank, card1, { q_nope: 'x', q_email: 'a@example.com' })).toEqual({
      q_email: 'a@example.com',
    });
  });
});

describe('whyWeAsk', () => {
  it("returns the bank's explanation", () => {
    const q = bank.find((x) => x.id === 'q_pep')!;
    expect(whyWeAsk(q, 'en')).toBe(q.why_we_ask.en);
  });

  it('falls back to English when the bank has no translation', () => {
    const q = bank.find((x) => x.id === 'q_birth_date')!;
    expect(whyWeAsk(q, 'fi')).toBe(q.why_we_ask.en);
    expect(whyWeAsk({ ...q, why_we_ask: { en: 'E', fi: 'F' } }, 'fi')).toBe('F');
  });
});
