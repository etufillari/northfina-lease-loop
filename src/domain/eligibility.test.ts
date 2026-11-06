import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadCustomers, loadQuestions } from '@/data/load';
import type { CoefficientTable, Customer, Question } from '@/data/schemas';
import { evaluateEligibility } from './eligibility';
import { answersFromCustomer, customerTypeFromAnswers, type Answers } from './question-flow';

let table: CoefficientTable;
let questions: Question[];
let customers: Customer[];
beforeAll(async () => {
  const [coefficients, bank, personas] = await Promise.all([
    loadCoefficientTable(),
    loadQuestions(),
    loadCustomers(),
  ]);
  table = coefficients;
  questions = bank.questions;
  customers = personas;
});

function persona(id: string): Customer {
  const customer = customers.find((value) => value.id === id);
  if (!customer) throw new Error(`fixture ${id} is missing`);
  return customer;
}

function evaluate(
  customer: Customer,
  changes: Answers = {},
  financedCents = 389000,
  monthlyGrossCents = 13466,
  overrides: Partial<Parameters<typeof evaluateEligibility>[0]> = {}
) {
  return evaluateEligibility({
    customer,
    answers: { ...answersFromCustomer(customer), q_usage_purpose: 'commuting', ...changes },
    questions,
    category: 'e_bike',
    financedCents,
    termMonths: 36,
    monthlyGrossCents,
    startDate: '2026-11-05',
    table,
    ...overrides,
  });
}

describe('disclosed answers, not hidden persona facts', () => {
  it('approves Aino independently of the demo identifier', () => {
    const result = evaluate({ ...persona('cust-aino'), id: 'another-id' });
    expect(result.status).toBe('approved');
    expect(result.reasons).toEqual([]);
    expect(result.answers).not.toHaveProperty('q_pep');
  });

  it('uses an edited visible answer without a profile-conflict penalty', () => {
    const result = evaluate(persona('cust-sanna'), {
      q_country: 'SE',
      q_monthly_income: 10000000,
    });
    expect(result.status).toBe('approved');
    expect(result.reasons).toEqual([]);
    expect(result.answers.q_country).toBe('SE');
  });

  it.each([199999, 200000])('runs affordability only when income is asked: %s', (amount) => {
    const result = evaluate(persona('cust-aino'), { q_monthly_income: 0 }, amount);
    expect(result.status).toBe(amount < 200000 ? 'approved' : 'declined');
    expect(result.reasons).toEqual(amount < 200000 ? [] : ['unaffordable']);
    expect(Object.hasOwn(result.answers, 'q_monthly_income')).toBe(amount >= 200000);
  });

  it('does not use even invalid stale income or PEP answers when their questions are hidden', () => {
    const result = evaluate(
      { ...persona('cust-aino'), is_pep: true },
      { q_monthly_income: -1, q_pep: 'yes', q_pep_details: 'Old details' },
      199999
    );
    expect(result.status).toBe('approved');
    expect(result.invalidQuestionIds).toEqual([]);
    expect(result.answers).not.toHaveProperty('q_monthly_income');
    expect(result.answers).not.toHaveProperty('q_pep');
    expect(result.answers).not.toHaveProperty('q_pep_details');
  });

  it.each([
    { amount: 999999, answer: 'yes', status: 'approved', reasons: [] },
    { amount: 1000000, answer: 'yes', status: 'manual_review', reasons: ['pep'] },
    { amount: 1000000, answer: 'no', status: 'approved', reasons: [] },
  ])('checks PEP at $amount with answer $answer', ({ amount, answer, status, reasons }) => {
    const result = evaluate(
      { ...persona('cust-aino'), is_pep: true },
      { q_pep: answer, q_pep_details: 'Synthetic public office' },
      amount
    );
    expect(result.status).toBe(status);
    expect(result.reasons).toEqual(reasons);
    expect(Object.hasOwn(result.answers, 'q_pep_details')).toBe(
      amount >= 1000000 && answer === 'yes'
    );
  });

  it('requires visible risk answers rather than filling them behind the customer', () => {
    const customer = persona('cust-aino');
    const { q_pep: _pep, q_monthly_income: _income, ...answers } = answersFromCustomer(customer);
    const result = evaluate(customer, {}, 1000000, 13466, {
      answers: { ...answers, q_usage_purpose: 'commuting' },
    });
    expect(result.status).toBe('incomplete');
    expect(result.missingQuestionIds).toEqual(['q_monthly_income', 'q_pep']);
    expect(result.reasons).toEqual(['answers_missing']);
  });

  it('selects the form branch from the visible customer-type answer', () => {
    const customer = persona('cust-mikko');
    const answers = {
      ...answersFromCustomer(persona('cust-kettukoodi')),
      q_usage_purpose: 'commuting',
    };
    const result = evaluate(customer, {}, 389000, 13466, { answers });
    expect(result.status).toBe('approved');
    expect(result.answers.q_customer_type).toBe('company');
    expect(result.answers).not.toHaveProperty('q_birth_date');
    expect(result.answers).not.toHaveProperty('q_country');
  });

  it.each(['consumer', 'sole_trader', 'company'])('recognises customer type %s', (value) => {
    expect(customerTypeFromAnswers({ q_customer_type: value })).toBe(value);
  });

  it.each<Answers>([{}, { q_customer_type: 'unknown' }, { q_customer_type: 0 }])(
    'does not select a persona branch for invalid or missing type %j',
    (answers) => {
      expect(customerTypeFromAnswers(answers)).toBeUndefined();
      expect(evaluate(persona('cust-aino'), {}, 389000, 13466, { answers }).status).toBe(
        'incomplete'
      );
    }
  );
});

describe('visible age, residence and company rules', () => {
  it.each([
    { birth: '2008-11-05', status: 'approved' },
    { birth: '2008-11-06', status: 'declined' },
  ])('checks disclosed age on the start date: $birth', ({ birth, status }) => {
    const result = evaluate(persona('cust-aino'), { q_birth_date: birth });
    expect(result.status).toBe(status);
    expect(result.reasons).toEqual(status === 'declined' ? ['under_age'] : []);
  });

  it('still blocks the underage scenario using its visible prefilled birth date', () => {
    expect(evaluate(persona('cust-mikko')).reasons).toContain('under_age');
  });

  it.each([
    { startDate: '2026-02-28', status: 'declined' },
    { startDate: '2026-03-01', status: 'approved' },
  ])('preserves the leap-day birthday policy on $startDate', ({ startDate, status }) => {
    const result = evaluate(persona('cust-aino'), { q_birth_date: '2008-02-29' }, 389000, 13466, {
      startDate,
    });
    expect(result.status).toBe(status);
  });

  it.each(['FI', 'SE', 'EE'])('accepts an edited supported residence %s', (country) => {
    expect(evaluate(persona('cust-aino'), { q_country: country }).status).toBe('approved');
  });

  it('rejects other residence and maps unsupported persona countries to the visible option', () => {
    const customer = { ...persona('cust-aino'), country: 'US' };
    expect(answersFromCustomer(customer).q_country).toBe('other');
    expect(evaluate(customer).reasons).toEqual(['residency']);
    expect(evaluate(customer, { q_country: 'FI' }).status).toBe('approved');
  });

  it('does not apply the unasked residence rule to companies', () => {
    const result = evaluate({ ...persona('cust-kettukoodi'), country: 'US' });
    expect(result.status).toBe('approved');
    expect(result.answers).not.toHaveProperty('q_country');
  });

  it.each(['cust-pekka', 'cust-kettukoodi'])('validates the disclosed business ID for %s', (id) => {
    const customer = persona(id);
    if (customer.type === 'consumer') throw new Error('business fixture required');
    expect(evaluate(customer, { q_business_id: '1234567-8' }).reasons).toEqual([
      'invalid_business_id',
    ]);
    expect(
      evaluate({ ...customer, business_id: '1234567-8' }, { q_business_id: customer.business_id })
        .status
    ).toBe('approved');
  });

  it('requires an email for a disclosed lack of company signing authority', () => {
    const customer = persona('cust-norvi');
    const waiting = evaluate(customer, { q_signatory_email: 'signer@example.com' });
    expect(waiting.status).toBe('manual_review');
    expect(waiting.reasons).toEqual(['signatory_required']);
    expect(evaluate(customer).status).toBe('incomplete');
    const authorised = evaluate(customer, { q_can_sign: 'yes' });
    expect(authorised.status).toBe('approved');
    expect(authorised.answers).not.toHaveProperty('q_signatory_email');
  });

  it('retains the big-ticket farm questions and the disclosed PEP review', () => {
    const result = evaluate(
      persona('cust-haapala'),
      { q_farm_registry: 'SYNTHETIC-FARM-01', q_pep_details: 'Synthetic public office' },
      12500000,
      341000,
      { category: 'farm_machine', termMonths: 48 }
    );
    expect(result.status).toBe('manual_review');
    expect(result.reasons).toEqual(['pep']);
    expect(result.answers).toHaveProperty('q_annual_revenue');
    expect(result.answers).toHaveProperty('q_beneficial_owners');
  });
});

describe('validation, priorities and immutable input', () => {
  it('keeps invalid and missing active answers distinct and does not silently prefill them', () => {
    const result = evaluate(persona('cust-aino'), { q_email: 'bad', q_usage_purpose: '' });
    expect(result.status).toBe('incomplete');
    expect(result.reasons).toEqual(['answers_invalid', 'answers_missing']);
    expect(result.missingQuestionIds).toEqual(['q_email', 'q_usage_purpose']);
  });

  it('retains all disclosed reasons while decline takes priority', () => {
    const result = evaluate(
      persona('cust-aino'),
      { q_birth_date: '2009-01-01', q_email: 'bad', q_pep: 'yes', q_pep_details: 'Office' },
      1000000
    );
    expect(result.status).toBe('declined');
    expect(result.reasons).toEqual(['under_age', 'pep', 'answers_invalid', 'answers_missing']);
  });

  it('uses incomplete before manual review for missing visible PEP details', () => {
    const result = evaluate(persona('cust-aino'), { q_pep: 'yes' }, 1000000);
    expect(result.status).toBe('incomplete');
    expect(result.reasons).toEqual(['pep', 'answers_missing']);
    expect(result.missingQuestionIds).toEqual(['q_pep_details']);
  });

  it('accepts edited owners without changing the persona or input', () => {
    const customer = persona('cust-kettukoodi');
    const changes = { q_beneficial_owners: Object.freeze([' Owner B ']) as unknown as string[] };
    Object.freeze(changes);
    const before = JSON.stringify(customer);
    const result = evaluate(customer, changes, 5000000);
    expect(result.status).toBe('approved');
    expect(result.answers.q_beneficial_owners).toEqual(['Owner B']);
    expect(changes.q_beneficial_owners).toEqual([' Owner B ']);
    expect(JSON.stringify(customer)).toBe(before);
    expect(evaluate(customer, changes, 5000000)).toEqual(result);
  });
});

describe('money and financing boundaries', () => {
  it.each([
    { income: 0, gross: 0, status: 'approved' },
    { income: 0, gross: 1, status: 'declined' },
    { income: 100000, gross: 30000, status: 'approved' },
    { income: 100000, gross: 30001, status: 'declined' },
    { income: 9007199254740990, gross: 2702159776422297, status: 'approved' },
    { income: 9007199254740990, gross: 2702159776422298, status: 'declined' },
  ])('checks exact affordability for $income / $gross', ({ income, gross, status }) => {
    const result = evaluate(persona('cust-aino'), { q_monthly_income: income }, 200000, gross);
    expect(result.status).toBe(status);
    expect(result.reasons).toEqual(status === 'approved' ? [] : ['unaffordable']);
  });

  it.each([
    { financed: 29999, status: 'declined' },
    { financed: 30000, status: 'approved' },
    { financed: 25000000, status: 'approved' },
    { financed: 25000001, status: 'declined' },
  ])('checks the financing boundary at $financed', ({ financed, status }) => {
    const result = evaluate(persona('cust-aino'), {}, financed);
    expect(result.status).toBe(status);
    expect(result.reasons).toEqual(status === 'declined' ? ['financed_limits'] : []);
  });

  it.each([0, 18, 36.5])('rejects unsupported term %s', (termMonths) => {
    expect(evaluate(persona('cust-aino'), {}, 389000, 13466, { termMonths }).reasons).toEqual([
      'financed_limits',
    ]);
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid monthly gross cents %s',
    (gross) => {
      expect(() => evaluate(persona('cust-aino'), {}, 389000, gross)).toThrow(RangeError);
    }
  );
});

describe('question-specific blocking rules', () => {
  it.each([true, false])(
    'applies an active=%s usage blocker only to disclosed answers',
    (active) => {
      const bank: Question[] = questions.map((question) =>
        question.id === 'q_usage_purpose'
          ? {
              ...question,
              ask_when: active ? [] : [{ field: 'category', op: 'in', value: ['farm_machine'] }],
              blocks_application_when: [{ rule: 'answer_in', value: ['delivery'] }],
            }
          : question
      );
      const result = evaluate(
        persona('cust-aino'),
        { q_usage_purpose: 'delivery' },
        389000,
        13466,
        {
          questions: bank,
        }
      );
      expect(result.reasons).toEqual(active ? ['blocked_answer'] : []);
    }
  );
});
