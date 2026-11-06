import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import {
  answersFromCustomer,
  normaliseAnswers,
  type Answer,
  type Answers,
  type QuestionContext,
} from './question-flow';

let questions: Question[];
let customers: Customer[];
beforeAll(async () => {
  const [bank, personas] = await Promise.all([loadQuestions(), loadCustomers()]);
  questions = bank.questions;
  customers = personas;
});

const company: QuestionContext = {
  customer_type: 'company',
  category: 'farm_machine',
  financed_amount_cents: 12500000,
  term_months: 48,
};
const consumer: QuestionContext = {
  customer_type: 'consumer',
  category: 'laptop',
  financed_amount_cents: 199999,
  term_months: 24,
};

function makeQuestion(type: Question['type'], overrides: Partial<Question> = {}): Question {
  return {
    id: 'q_value',
    type,
    text: { en: 'Value', fi: 'Value', sv: 'Value', et: 'Value' },
    why_we_ask: { en: 'Synthetic validation test' },
    ask_when: [],
    ...(type === 'choice' ? { options: ['yes', 'no'] } : {}),
    ...overrides,
  };
}

describe('question targeting and pruning', () => {
  it('uses all ask_when conditions and respects the exact amount boundary', () => {
    const below = normaliseAnswers(questions, consumer, {}).activeQuestions.map((q) => q.id);
    const at = normaliseAnswers(
      questions,
      { ...consumer, financed_amount_cents: 200000 },
      {}
    ).activeQuestions.map((q) => q.id);
    expect(below).not.toContain('q_monthly_income');
    expect(at).toContain('q_monthly_income');
    expect(at).not.toContain('q_business_id');
    expect(normaliseAnswers(questions, company, {}).activeQuestions.map((q) => q.id)).toEqual(
      expect.arrayContaining(['q_annual_revenue', 'q_beneficial_owners', 'q_pep'])
    );
  });

  it('removes a hidden PEP answer and its dependent details until stable', () => {
    const input: Answers = {
      q_customer_type: 'company',
      q_pep: 'yes',
      q_pep_details: 'Owner holds office',
      q_unknown: 'discard',
    };
    const result = normaliseAnswers(
      questions,
      { ...company, financed_amount_cents: 999999 },
      input
    );
    expect(result.answers).toEqual({ q_customer_type: 'company' });
    expect(result.removedIds).toEqual(
      expect.arrayContaining(['q_pep', 'q_pep_details', 'q_unknown'])
    );
    expect(input.q_pep_details).toBe('Owner holds office');
  });

  it('drops the signatory email when can_sign changes to yes', () => {
    const result = normaliseAnswers(questions, company, {
      q_can_sign: 'yes',
      q_signatory_email: 'person@example.com',
    });
    expect(result.answers.q_signatory_email).toBeUndefined();
    expect(result.activeQuestions.map((q) => q.id)).not.toContain('q_signatory_email');
  });

  it('requires a signatory email only when the applicant cannot sign', () => {
    const missing = normaliseAnswers(questions, company, { q_can_sign: 'no' });
    expect(missing.missingIds).toContain('q_signatory_email');
    const filled = normaliseAnswers(questions, company, {
      q_can_sign: 'no',
      q_signatory_email: 'person@example.com',
    });
    expect(filled.answers.q_signatory_email).toBe('person@example.com');
    expect(filled.missingIds).not.toContain('q_signatory_email');
  });

  it('uses the separate context even when the customer type answer disagrees', () => {
    const result = normaliseAnswers(questions, consumer, {
      q_customer_type: 'company',
      q_can_sign: 'no',
      q_signatory_email: 'person@example.com',
      q_usage_purpose: 'commuting',
      q_farm_registry: '123',
    });
    expect(result.answers).toEqual({ q_customer_type: 'company' });
    expect(result.activeQuestions.map((q) => q.id)).toContain('q_full_name');
    expect(result.activeQuestions.map((q) => q.id)).not.toContain('q_company_name');
  });

  it('reports unknown keys even when their names belong to Object.prototype', () => {
    const input: Answers = JSON.parse(
      '{"__proto__":"discard","constructor":"discard","toString":"discard"}'
    );
    expect(normaliseAnswers([], consumer, input)).toEqual({
      answers: {},
      activeQuestions: [],
      removedIds: ['__proto__', 'constructor', 'toString'],
      invalidIds: [],
      missingIds: [],
    });
  });

  it('preserves bank order and leaves frozen input arrays and objects unchanged', () => {
    const owners = [' A ', ' B '];
    Object.freeze(owners);
    const input = Object.freeze({ q_beneficial_owners: owners, q_company_name: ' Company ' });
    const bank = Object.freeze([...questions]);
    const result = normaliseAnswers(bank, Object.freeze({ ...company }), input);
    expect(result.answers).toEqual({ q_beneficial_owners: ['A', 'B'], q_company_name: 'Company' });
    expect(result.answers.q_beneficial_owners).not.toBe(owners);
    expect(owners).toEqual([' A ', ' B ']);
    expect(result.activeQuestions).toEqual(
      questions.filter((question) => result.activeQuestions.includes(question))
    );
    const again = normaliseAnswers(bank, company, result.answers);
    expect(again).toEqual(result);
  });

  it('validates active values but ignores invalid hidden answers', () => {
    const result = normaliseAnswers(questions, consumer, {
      q_customer_type: 'consumer',
      q_email: 'bad',
      q_birth_date: '2026-02-29',
      q_employment: 'wizard',
      q_monthly_income: -1,
      q_beneficial_owners: [],
    });
    expect(result.invalidIds).toEqual(['q_email', 'q_birth_date', 'q_employment']);
    expect(result.missingIds).toEqual(
      expect.arrayContaining(['q_email', 'q_birth_date', 'q_employment'])
    );
  });

  it('handles money, lists, blank text and numeric lte without coercion', () => {
    const question: Question = {
      id: 'q_small',
      type: 'text',
      text: { en: 'x', fi: 'x', sv: 'x', et: 'x' },
      why_we_ask: { en: 'x' },
      ask_when: [{ field: 'term_months', op: 'lte', value: 24 }],
    };
    expect(normaliseAnswers([question], consumer, { q_small: ' yes ' }).answers).toEqual({
      q_small: 'yes',
    });
    expect(normaliseAnswers([question], company, { q_small: 'yes' }).answers).toEqual({});
    const result = normaliseAnswers(questions, company, {
      q_beneficial_owners: [' A ', ' B '],
      q_annual_revenue: 0,
      q_farm_registry: ' ',
    });
    expect(result.answers.q_beneficial_owners).toEqual(['A', 'B']);
    expect(result.answers.q_annual_revenue).toBe(0);
    expect(result.invalidIds).toContain('q_farm_registry');
  });
});

describe('answer validation boundaries', () => {
  it.each<{ type: Question['type']; value: Answer; expected: Answer }>([
    { type: 'money', value: 0, expected: 0 },
    { type: 'money', value: Number.MAX_SAFE_INTEGER, expected: Number.MAX_SAFE_INTEGER },
    { type: 'text', value: '  Name  ', expected: 'Name' },
    { type: 'text', value: 'x'.repeat(1000), expected: 'x'.repeat(1000) },
    { type: 'choice', value: 'yes', expected: 'yes' },
    { type: 'date', value: '2028-02-29', expected: '2028-02-29' },
    { type: 'email', value: 'person@example.com', expected: 'person@example.com' },
    { type: 'email', value: `${'a'.repeat(248)}@b.com`, expected: `${'a'.repeat(248)}@b.com` },
    { type: 'list', value: [' A ', 'B'], expected: ['A', 'B'] },
    {
      type: 'list',
      value: Array(100).fill('x'.repeat(200)),
      expected: Array(100).fill('x'.repeat(200)),
    },
  ])('accepts a valid $type answer without numeric coercion', ({ type, value, expected }) => {
    const question = makeQuestion(type);
    expect(normaliseAnswers([question], consumer, { q_value: value })).toEqual({
      answers: { q_value: expected },
      activeQuestions: [question],
      removedIds: [],
      invalidIds: [],
      missingIds: [],
    });
  });

  it.each<{ type: Question['type']; value: unknown }>([
    { type: 'money', value: -1 },
    { type: 'money', value: 0.5 },
    { type: 'money', value: '250000' },
    { type: 'money', value: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'money', value: NaN },
    { type: 'money', value: Infinity },
    { type: 'text', value: '' },
    { type: 'text', value: ' \t\n ' },
    { type: 'text', value: 123 },
    { type: 'text', value: ['Name'] },
    { type: 'text', value: 'x'.repeat(1001) },
    { type: 'choice', value: ' yes ' },
    { type: 'choice', value: 'maybe' },
    { type: 'date', value: '2026-02-29' },
    { type: 'date', value: '2028-02-29\n' },
    { type: 'email', value: 'person@example' },
    { type: 'email', value: ' person@example.com' },
    { type: 'email', value: 'person@@example.com' },
    { type: 'email', value: `${'a'.repeat(249)}@b.com` },
    { type: 'list', value: 'Owner' },
    { type: 'list', value: [] },
    { type: 'list', value: ['Owner', ' '] },
    { type: 'list', value: ['x'.repeat(201)] },
    { type: 'list', value: Array(101).fill('Owner') },
    { type: 'list', value: ['Owner', 123] },
    { type: 'list', value: [null] },
  ])('rejects an invalid $type answer and reports it as missing', ({ type, value }) => {
    const question = makeQuestion(type);
    expect(normaliseAnswers([question], consumer, { q_value: value as Answer })).toEqual({
      answers: {},
      activeQuestions: [question],
      removedIds: ['q_value'],
      invalidIds: ['q_value'],
      missingIds: ['q_value'],
    });
  });

  it('reports an absent answer only as missing', () => {
    const result = normaliseAnswers([makeQuestion('text')], consumer, {});
    expect(result.missingIds).toEqual(['q_value']);
    expect(result.invalidIds).toEqual([]);
    expect(result.removedIds).toEqual([]);
  });
});

describe('condition comparisons', () => {
  it.each([
    { op: 'gte' as const, term: 23, active: false },
    { op: 'gte' as const, term: 24, active: true },
    { op: 'gte' as const, term: 25, active: true },
    { op: 'lte' as const, term: 23, active: true },
    { op: 'lte' as const, term: 24, active: true },
    { op: 'lte' as const, term: 25, active: false },
    { op: 'gte' as const, term: NaN, active: false },
    { op: 'gte' as const, term: Infinity, active: false },
    { op: 'lte' as const, term: -Infinity, active: false },
  ])('$op at term $term gives active=$active', ({ op, term, active }) => {
    const question = makeQuestion('text', {
      ask_when: [{ field: 'term_months', op, value: 24 }],
    });
    const result = normaliseAnswers([question], { ...consumer, term_months: term }, {});
    expect(result.activeQuestions).toEqual(active ? [question] : []);
  });

  it('does not use unknown, absent or string answers in numeric conditions', () => {
    const question = makeQuestion('text', {
      ask_when: [{ field: 'answers.q_control', op: 'gte', value: 10 }],
    });
    const control = makeQuestion('text', { id: 'q_control' });
    expect(normaliseAnswers([question], consumer, { q_control: 20 }).activeQuestions).toEqual([]);
    expect(normaliseAnswers([question], consumer, {}).activeQuestions).toEqual([]);
    expect(
      normaliseAnswers([control, question], consumer, { q_control: '20' }).activeQuestions
    ).toEqual([control]);
  });

  it('reads valid numeric answers but does not coerce them for in conditions', () => {
    const control = makeQuestion('money', { id: 'q_control' });
    const numeric = makeQuestion('text', {
      ask_when: [{ field: 'answers.q_control', op: 'gte', value: 10 }],
    });
    const membership = makeQuestion('text', {
      id: 'q_membership',
      ask_when: [{ field: 'answers.q_control', op: 'in', value: ['10'] }],
    });
    const result = normaliseAnswers([control, numeric, membership], consumer, { q_control: 10 });
    expect(result.activeQuestions).toEqual([control, numeric]);
  });
});

describe('profile prefill', () => {
  it('copies known facts for all customer types, keeping extra questions unanswered', () => {
    for (const customer of customers) {
      const result = answersFromCustomer(customer);
      expect(result.q_customer_type).toBe(customer.type);
      expect(result.q_email).toBe(customer.email);
      expect(result.q_country).toBe(customer.country);
      expect(result.q_pep).toBe(customer.is_pep ? 'yes' : 'no');
      expect(result.q_usage_purpose).toBeUndefined();
      expect(result.q_farm_registry).toBeUndefined();
      expect(result.q_pep_details).toBeUndefined();
      expect(result.q_signatory_email).toBeUndefined();
      if (customer.type === 'company') {
        expect(result.q_company_name).toBe(customer.name);
        expect(result.q_can_sign).toBe(customer.applicant_can_sign ? 'yes' : 'no');
        expect(result.q_annual_revenue).toBe(customer.annual_revenue_cents);
        expect(result.q_full_name).toBeUndefined();
        expect(result.q_birth_date).toBeUndefined();
      } else {
        expect(result.q_full_name).toBe(customer.name);
        expect(result.q_birth_date).toBe(customer.birth_date);
        expect(result.q_company_name).toBeUndefined();
      }
      if (customer.type === 'consumer') {
        expect(result.q_employment).toBe(customer.employment);
        expect(result.q_monthly_income).toBe(customer.monthly_net_income_cents);
        expect(result.q_business_id).toBeUndefined();
      } else {
        expect(result.q_business_id).toBe(customer.business_id);
        expect(result.q_vat_registered).toBe(customer.vat_registered ? 'yes' : 'no');
        expect(result.q_monthly_income).toBeUndefined();
      }
    }
    const haapala = customers.find((customer) => customer.id === 'cust-haapala');
    if (!haapala || haapala.type !== 'company') throw new Error('fixture missing');
    const result = answersFromCustomer(haapala);
    expect(result.q_beneficial_owners).toEqual(haapala.beneficial_owners);
    expect(result.q_beneficial_owners).not.toBe(haapala.beneficial_owners);
  });

  it('keeps absent beneficial owners unanswered', () => {
    const company = customers.find((customer) => customer.type === 'company');
    if (!company || company.type !== 'company') throw new Error('fixture missing');
    const { beneficial_owners: _owners, ...withoutOwners } = company;
    expect(answersFromCustomer(withoutOwners).q_beneficial_owners).toBeUndefined();
  });
});
