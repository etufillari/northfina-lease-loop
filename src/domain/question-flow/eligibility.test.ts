import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, EligibilityRule, Question } from '@/data/schemas';
import { answersFromCustomer, eligibilityInputFromAnswers, grossFromNetCents } from './answers';
import {
  birthdayAtAge,
  evaluate,
  maxAffordableRentCents,
  type EligibilityInput,
} from './eligibility';
import { pruneAnswers, type FlowContext } from './engine';

let rules: EligibilityRule[];
let bank: Question[];
let customers: Customer[];
beforeAll(async () => {
  const file = await loadQuestions();
  rules = file.eligibility_rules;
  bank = file.questions;
  customers = await loadCustomers();
});

const customer = (id: string) => customers.find((c) => c.id === id)!;
const LIMITS = { minCents: 30_000, maxCents: 25_000_000 };

/** Run a data-pack customer through the flow the way the application does. */
function decide(id: string, context: Omit<FlowContext, 'customerType'>, grossRent: number) {
  const c = customer(id);
  const full = { ...context, customerType: c.type };
  const answers = pruneAnswers(bank, full, answersFromCustomer(c));
  return evaluate(
    rules,
    eligibilityInputFromAnswers({
      context: full,
      answers,
      startDate: '2026-11-05',
      grossMonthlyRentCents: grossRent,
      financedLimits: LIMITS,
    })
  );
}

const base: EligibilityInput = {
  customerType: 'consumer',
  startDate: '2026-11-05',
  birthDate: '1997-04-12',
  country: 'FI',
  monthlyNetIncomeCents: 320_000,
  grossMonthlyRentCents: 13_466,
  isPep: false,
  financedCents: 389_000,
  financedLimits: LIMITS,
};

describe('birthdayAtAge', () => {
  it('card 5: Mikko, born 2009-03-10, turns 18 on 2027-03-10', () => {
    expect(birthdayAtAge('2009-03-10', 18)).toBe('2027-03-10');
  });

  it('a 29 February birthday falls on 1 March in a year without one', () => {
    expect(birthdayAtAge('2008-02-29', 18)).toBe('2026-03-01');
    expect(birthdayAtAge('2008-02-29', 16)).toBe('2024-02-29');
  });
});

describe('evaluate: card 5 (Mikko is 17 on the start date)', () => {
  // laptop-008 (Gamer 17), 289 000 financed, band B. Gross = net + 25.5 % VAT, half up.
  // 24 months: 10 269 net → 12 888 gross; 36: 7 972 → 10 005; 48: 6 631 → 8 322.
  // 30 % of his 40 000 net income is 12 000.
  const mikko = (grossRent: number) =>
    decide('cust-mikko', { category: 'laptop', financedCents: 289_000, termMonths: 36 }, grossRent);

  it('is rejected with too_young and the day he turns 18', () => {
    expect(mikko(10_005)).toEqual({
      decision: 'rejected',
      reasons: [
        { code: 'too_young', params: { birthDate: '2009-03-10', eighteenOn: '2027-03-10' } },
      ],
    });
  });

  it('at 36 and 48 months affordability passes, so age is the only reason', () => {
    expect(mikko(10_005).reasons.map((r) => r.code)).toEqual(['too_young']);
    expect(mikko(8_322).reasons.map((r) => r.code)).toEqual(['too_young']);
  });

  it('at 24 months he would also fail affordability: every failure is listed', () => {
    expect(mikko(12_888).reasons.map((r) => r.code)).toEqual(['too_young', 'unaffordable']);
  });

  it('on his 18th birthday the age rule passes; the day before it does not', () => {
    const input = { ...base, birthDate: '2009-03-10', monthlyNetIncomeCents: 40_000 };
    input.grossMonthlyRentCents = 10_005;
    expect(evaluate(rules, { ...input, startDate: '2027-03-10' }).decision).toBe('approved');
    expect(evaluate(rules, { ...input, startDate: '2027-03-09' }).decision).toBe('rejected');
  });
});

describe('evaluate: card 6 (Norvi, the applicant cannot sign)', () => {
  it('one ebike-004 (549 000) ends in awaiting_signatory with the signatory named', () => {
    const net = 15_144;
    const result = decide(
      'cust-norvi',
      { category: 'e_bike', financedCents: 549_000, termMonths: 36 },
      grossFromNetCents(net, 2_550)
    );
    expect(result).toEqual({
      decision: 'awaiting_signatory',
      reasons: [
        { code: 'signatory_needed', params: { signatoryEmail: 'signatory@norvi.example.com' } },
      ],
    });
  });
});

describe('evaluate: card 7 (Haapala, an owner is a PEP)', () => {
  it('farm-002, 12 500 000 financed: manual_review with pep, never approved', () => {
    const result = decide(
      'cust-haapala',
      { category: 'farm_machine', financedCents: 12_500_000, termMonths: 48 },
      grossFromNetCents(272_038, 2_550)
    );
    expect(result).toEqual({ decision: 'manual_review', reasons: [{ code: 'pep', params: {} }] });
  });

  it('a PEP who also cannot sign goes to manual review with both reasons', () => {
    const result = evaluate(rules, {
      ...base,
      customerType: 'company',
      businessId: '2876543-5',
      isPep: true,
      applicantCanSign: false,
    });
    expect(result.decision).toBe('manual_review');
    expect(result.reasons.map((r) => r.code)).toEqual(['pep', 'signatory_needed']);
  });
});

describe('evaluate: the other rules', () => {
  it('the broken business id (Typo Trading Oy) is rejected with invalid_business_id', () => {
    const result = decide(
      'cust-broken-id',
      { category: 'laptop', financedCents: 349_000, termMonths: 36 },
      12_000
    );
    expect(result).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'invalid_business_id', params: { businessId: '1234567-8' } }],
    });
  });

  it('a company in DE (its record country, review finding 12) is rejected on residency', () => {
    const company = {
      ...base,
      customerType: 'company' as const,
      birthDate: undefined,
      country: 'DE',
    };
    expect(evaluate(rules, company).reasons).toContainEqual({
      code: 'residency_not_allowed',
      params: { country: 'DE' },
    });
  });

  it('residency outside FI, SE and EE is rejected', () => {
    expect(evaluate(rules, { ...base, country: 'other' }).reasons).toEqual([
      { code: 'residency_not_allowed', params: { country: 'other' } },
    ]);
  });

  it('affordability: exactly 30 % passes, one cent more does not', () => {
    expect(maxAffordableRentCents(320_000)).toBe(96_000);
    expect(evaluate(rules, { ...base, grossMonthlyRentCents: 96_000 }).decision).toBe('approved');
    expect(evaluate(rules, { ...base, grossMonthlyRentCents: 96_001 }).reasons).toEqual([
      {
        code: 'unaffordable',
        params: {
          grossMonthlyRentCents: 96_001,
          maxRentCents: 96_000,
          monthlyNetIncomeCents: 320_000,
        },
      },
    ]);
  });

  it('affordability is not applied to companies or when income was not asked', () => {
    expect(evaluate(rules, { ...base, monthlyNetIncomeCents: undefined }).decision).toBe(
      'approved'
    );
    const company = {
      ...base,
      customerType: 'company',
      businessId: '3187650-7',
      birthDate: undefined,
    };
    expect(evaluate(rules, { ...company, monthlyNetIncomeCents: 1 }).decision).toBe('approved');
  });

  it('a person without a birth date is rejected with missing_answer, not approved', () => {
    expect(evaluate(rules, { ...base, birthDate: undefined }).reasons).toEqual([
      { code: 'missing_answer', params: { question: 'q_birth_date' } },
    ]);
  });

  it('the financed amount must fit a band: both limits included', () => {
    expect(evaluate(rules, { ...base, financedCents: 30_000 }).decision).toBe('approved');
    expect(evaluate(rules, { ...base, financedCents: 25_000_000 }).decision).toBe('approved');
    expect(evaluate(rules, { ...base, financedCents: 29_999 }).reasons[0]).toEqual({
      code: 'financed_out_of_range',
      params: { financedCents: 29_999, minCents: 30_000, maxCents: 25_000_000 },
    });
  });

  it('a rule missing from the rule list is not checked', () => {
    const noAge = rules.filter((r) => r.id !== 'min_age');
    expect(evaluate(noAge, { ...base, birthDate: '2015-01-01' }).decision).toBe('approved');
  });

  it('approved carries all_checks_passed', () => {
    expect(evaluate(rules, base)).toEqual({
      decision: 'approved',
      reasons: [{ code: 'all_checks_passed', params: {} }],
    });
  });
});

describe('every customer in customers.json gets a decision without throwing', () => {
  const expected: Record<string, string> = {
    'cust-aino': 'approved',
    'cust-mikko': 'rejected',
    'cust-lena': 'approved',
    'cust-pekka': 'approved',
    'cust-kettukoodi': 'approved',
    // D82: the PEP question is hidden below 10 000 € financed, so no PEP check runs.
    'cust-haapala': 'approved',
    'cust-norvi': 'awaiting_signatory',
    'cust-broken-id': 'rejected',
    'cust-sanna': 'approved',
    'cust-olavi': 'approved',
  };

  it('card 1 terms (ebike-003, 36 months, 13 466 gross) for each persona', () => {
    const decisions = Object.fromEntries(
      customers.map((c) => [
        c.id,
        decide(c.id, { category: 'e_bike', financedCents: 389_000, termMonths: 36 }, 13_466)
          .decision,
      ])
    );
    expect(decisions).toEqual(expected);
  });

  it('and for each category and term, every result has at least one reason', () => {
    for (const c of customers) {
      for (const category of ['e_bike', 'laptop', 'farm_machine']) {
        for (const termMonths of [12, 24, 36, 48]) {
          const result = decide(c.id, { category, financedCents: 1_500_000, termMonths }, 50_000);
          expect(result.reasons.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('evaluate: answers that differ from the customer record (D38)', () => {
  const company: EligibilityInput = {
    customerType: 'company',
    startDate: '2026-11-05',
    grossMonthlyRentCents: 10_005,
    businessId: '0737546-2',
    isPep: false,
    applicantCanSign: true,
    financedCents: 289_000,
    financedLimits: LIMITS,
  };

  it('the trap: card 5 Mikko answering "company" is never approved by a rule', () => {
    const result = evaluate(rules, { ...company, recordMismatches: ['q_customer_type'] });
    expect(result).toEqual({
      decision: 'manual_review',
      reasons: [{ code: 'answer_differs_from_record', params: { question: 'q_customer_type' } }],
    });
  });

  it('every differing answer is listed, after pep', () => {
    const result = evaluate(rules, {
      ...base,
      isPep: true,
      recordMismatches: ['q_birth_date', 'q_country'],
    });
    expect(result.decision).toBe('manual_review');
    expect(result.reasons).toEqual([
      { code: 'pep', params: {} },
      { code: 'answer_differs_from_record', params: { question: 'q_birth_date' } },
      { code: 'answer_differs_from_record', params: { question: 'q_country' } },
    ]);
  });

  it('a failed rule still rejects, with the failures only', () => {
    const result = evaluate(rules, {
      ...base,
      birthDate: '2009-03-10',
      recordMismatches: ['q_birth_date'],
    });
    expect(result.decision).toBe('rejected');
    expect(result.reasons.map((r) => r.code)).toEqual(['too_young']);
  });

  it('a company that cannot sign and differs from the record: manual review, then the signatory', () => {
    const result = evaluate(rules, {
      ...company,
      applicantCanSign: false,
      signatoryEmail: 'sign@x.fi',
      recordMismatches: ['q_business_id'],
    });
    expect(result.decision).toBe('manual_review');
    expect(result.reasons.map((r) => r.code)).toEqual([
      'answer_differs_from_record',
      'signatory_needed',
    ]);
  });

  it('no differences (an empty list) changes nothing', () => {
    expect(evaluate(rules, { ...base, recordMismatches: [] }).decision).toBe('approved');
  });
});
