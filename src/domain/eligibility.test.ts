import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadCustomers, loadQuestions } from '@/data/load';
import type { CoefficientTable, Customer, Question } from '@/data/schemas';
import { ageOn, decideEligibility, type EligibilityInput } from './eligibility';

let questions: Question[];
let table: CoefficientTable;
let customers: Customer[];
beforeAll(async () => {
  questions = (await loadQuestions()).questions;
  table = await loadCoefficientTable();
  customers = await loadCustomers();
});

const START = '2026-11-05';

/** The answers a persona from the data pack would give. Extra answers are pruned when hidden. */
function answersFor(c: Customer): EligibilityInput['answers'] {
  const common = { q_customer_type: c.type, q_email: c.email, q_pep: c.is_pep ? 'yes' : 'no' };
  const filler = {
    q_usage_purpose: 'commuting',
    q_farm_registry: 'FI-0001',
    q_beneficial_owners: 'owners',
    q_pep_details: 'Local councillor',
  };
  if (c.type === 'company') {
    return {
      ...common,
      ...filler,
      q_company_name: c.name,
      q_business_id: c.business_id,
      q_can_sign: c.applicant_can_sign ? 'yes' : 'no',
      q_signatory_email: 'signatory@example.com',
      q_vat_registered: c.vat_registered ? 'yes' : 'no',
      q_annual_revenue: c.annual_revenue_cents,
    };
  }
  const person = {
    ...common,
    ...filler,
    q_full_name: c.name,
    q_birth_date: c.birth_date,
    q_country: c.country,
  };
  if (c.type === 'sole_trader') {
    return {
      ...person,
      q_business_id: c.business_id,
      q_vat_registered: c.vat_registered ? 'yes' : 'no',
    };
  }
  return { ...person, q_employment: c.employment, q_monthly_income: c.monthly_net_income_cents };
}

function decide(
  customerId: string,
  deal: { category: string; financed: number; term: number },
  extra: Partial<EligibilityInput> = {}
) {
  const customer = customers.find((c) => c.id === customerId)!;
  return decideEligibility({
    questions,
    coefficientTable: table,
    deal: {
      customer_type: customer.type,
      category: deal.category,
      financed_amount_cents: deal.financed,
      term_months: deal.term,
    },
    answers: answersFor(customer),
    contractStartDate: START,
    ...extra,
  });
}

const rules = (d: { reasons: { rule: string }[] }) => d.reasons.map((r) => r.rule);

describe('decideEligibility with the data-pack personas', () => {
  it('approves Aino on the happy path (card 1)', () => {
    const result = decide(
      'cust-aino',
      { category: 'e_bike', financed: 389_000, term: 36 },
      { monthlyRentInclVatCents: 13_466 }
    );
    expect(result).toEqual({ decision: 'yes', reasons: [] });
  });

  it('refuses Mikko, aged 17, for the minimum age (card 5)', () => {
    const result = decide('cust-mikko', { category: 'laptop', financed: 150_000, term: 24 });
    expect(result.decision).toBe('no');
    expect(result.reasons).toEqual([
      {
        rule: 'min_age',
        outcome: 'no',
        params: { question: 'q_birth_date', age: 17, minimum: 18 },
      },
    ]);
  });

  it('sends Norvi to manual review because the applicant cannot sign (card 6)', () => {
    const result = decide('cust-norvi', { category: 'e_bike', financed: 1_000_000, term: 36 });
    expect(result.decision).toBe('manual_review');
    expect(rules(result)).toEqual(['signatory_required']);
  });

  it('sends Haapalan Tila to manual review because of the PEP (card 7)', () => {
    const result = decide('cust-haapala', {
      category: 'farm_machine',
      financed: 12_500_000,
      term: 48,
    });
    expect(result.decision).toBe('manual_review');
    expect(rules(result)).toEqual(['pep_manual_review']);
  });

  it('refuses the company with the broken business ID', () => {
    const result = decide('cust-broken-id', { category: 'laptop', financed: 300_000, term: 24 });
    expect(result.decision).toBe('no');
    expect(rules(result)).toEqual(['business_id']);
  });

  it('refuses a consumer outside FI, SE and EE', () => {
    const lena = customers.find((c) => c.id === 'cust-lena')!;
    const result = decideEligibility({
      questions,
      coefficientTable: table,
      deal: {
        customer_type: 'consumer',
        category: 'laptop',
        financed_amount_cents: 150_000,
        term_months: 24,
      },
      answers: { ...answersFor(lena), q_country: 'other' },
      contractStartDate: START,
    });
    expect(result.decision).toBe('no');
    expect(rules(result)).toEqual(['residency']);
  });

  it('approves the Estonian and the retired consumer', () => {
    for (const id of ['cust-lena', 'cust-olavi']) {
      const result = decide(id, { category: 'laptop', financed: 150_000, term: 24 });
      expect(result, id).toEqual({ decision: 'yes', reasons: [] });
    }
  });

  it('approves a valid sole trader', () => {
    const result = decide('cust-pekka', { category: 'e_bike', financed: 300_000, term: 24 });
    expect(result).toEqual({ decision: 'yes', reasons: [] });
  });
});

describe('decideEligibility rules', () => {
  const sanna = 'cust-sanna'; // income 900 €, so 30 % is 270 € = 27 000 cents
  const deal = { category: 'e_bike', financed: 549_000, term: 36 };

  it('allows rent of exactly 30 % of income and refuses one cent more', () => {
    expect(decide(sanna, deal, { monthlyRentInclVatCents: 27_000 }).decision).toBe('yes');
    const over = decide(sanna, deal, { monthlyRentInclVatCents: 27_001 });
    expect(over.decision).toBe('no');
    expect(over.reasons).toEqual([
      { rule: 'affordability', outcome: 'no', params: { rentCents: 27_001, incomeCents: 90_000 } },
    ]);
  });

  it('skips affordability when no rent is given or the income was not asked', () => {
    expect(decide(sanna, deal).decision).toBe('yes');
    // below 2 000 € financed the income question is not asked, so it cannot refuse
    const small = decide(
      sanna,
      { category: 'laptop', financed: 150_000, term: 24 },
      { monthlyRentInclVatCents: 99_999 }
    );
    expect(small.decision).toBe('yes');
  });

  it('refuses amounts outside the coefficient table', () => {
    const low = decide('cust-aino', { category: 'laptop', financed: 29_999, term: 24 });
    expect(low.decision).toBe('no');
    expect(low.reasons[0]).toMatchObject({
      rule: 'financed_limits',
      params: { reason: 'below_minimum' },
    });
    const high = decide('cust-kettukoodi', { category: 'laptop', financed: 25_000_001, term: 24 });
    expect(high.reasons[0]).toMatchObject({
      rule: 'financed_limits',
      params: { reason: 'above_maximum' },
    });
  });

  it('lets a hard no beat a manual review', () => {
    const haapala = customers.find((c) => c.id === 'cust-haapala')!;
    const result = decideEligibility({
      questions,
      coefficientTable: table,
      deal: {
        customer_type: 'company',
        category: 'farm_machine',
        financed_amount_cents: 12_500_000,
        term_months: 48,
      },
      answers: { ...answersFor(haapala), q_business_id: '1234567-8' },
      contractStartDate: START,
    });
    expect(result.decision).toBe('no');
    expect(rules(result)).toEqual(['business_id']);
  });

  it('is incomplete until every applicable question is answered', () => {
    const result = decideEligibility({
      questions,
      coefficientTable: table,
      deal: {
        customer_type: 'consumer',
        category: 'laptop',
        financed_amount_cents: 150_000,
        term_months: 24,
      },
      answers: { q_customer_type: 'consumer', q_email: '   ' },
      contractStartDate: START,
    });
    expect(result).toEqual({
      decision: 'incomplete',
      missing: ['q_full_name', 'q_birth_date', 'q_email', 'q_country', 'q_employment'],
      reasons: [],
    });
  });

  it('refuses a minor even while other questions are unanswered', () => {
    const result = decideEligibility({
      questions,
      coefficientTable: table,
      deal: {
        customer_type: 'consumer',
        category: 'laptop',
        financed_amount_cents: 150_000,
        term_months: 24,
      },
      answers: { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
      contractStartDate: START,
    });
    expect(result.decision).toBe('no');
  });

  it('asks again when the birth date is not a usable date', () => {
    const result = decideEligibility({
      questions,
      coefficientTable: table,
      deal: {
        customer_type: 'consumer',
        category: 'laptop',
        financed_amount_cents: 150_000,
        term_months: 24,
      },
      answers: { q_customer_type: 'consumer', q_birth_date: 'yesterday' },
      contractStartDate: START,
    });
    expect(result.decision).toBe('incomplete');
    if (result.decision === 'incomplete') expect(result.missing).toContain('q_birth_date');
  });

  it('ignores answers to questions that no longer apply', () => {
    // A stale PEP "yes" must not trigger manual review on a small deal where q_pep is not asked.
    const aino = customers.find((c) => c.id === 'cust-aino')!;
    const result = decideEligibility({
      questions,
      coefficientTable: table,
      deal: {
        customer_type: 'consumer',
        category: 'e_bike',
        financed_amount_cents: 389_000,
        term_months: 36,
      },
      answers: { ...answersFor(aino), q_pep: 'yes' },
      contractStartDate: START,
    });
    expect(result.decision).toBe('yes');
  });
});

describe('ageOn', () => {
  it('counts the birthday on its own day', () => {
    expect(ageOn('2008-11-05', '2026-11-04')).toBe(17);
    expect(ageOn('2008-11-05', '2026-11-05')).toBe(18);
  });

  it('turns 29 February births a year older on 1 March in non-leap years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('returns null for malformed dates', () => {
    expect(ageOn('nope', '2026-11-05')).toBeNull();
    expect(ageOn('2008-11-05', '5.11.2026')).toBeNull();
  });
});
