import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import {
  allowedCountries,
  applicantBirthDate,
  decide,
  minimumAge,
  type EligibilityInput,
} from './eligibility';
import { blockingAnswer } from './question-flow';

// Tests run against the real data pack, so they also catch a changed customer.
let customers: Customer[];
let questions: Question[];
beforeAll(async () => {
  customers = await loadCustomers();
  ({ questions } = await loadQuestions());
});

function customer(id: string): Customer {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

const input = (id: string, overrides: Partial<EligibilityInput> = {}): EligibilityInput => ({
  questions,
  customer: customer(id),
  answers: {},
  startOn: '2026-11-05',
  monthlyRentWithVatCents: 13_466,
  ...overrides,
});

const approved = { decision: 'approved', reasons: [], eligible_from: null };

describe('decide: approved', () => {
  it('approves the happy path (card 1)', () => {
    expect(decide(input('cust-aino'))).toEqual(approved);
  });

  it('approves a customer from another allowed country', () => {
    expect(decide(input('cust-lena'))).toEqual(approved);
  });

  it('approves a sole trader, who has no affordability check', () => {
    expect(decide(input('cust-pekka', { monthlyRentWithVatCents: 99_999_999 }))).toEqual(approved);
  });

  it('approves Norvi: who may sign is checked later (card 6)', () => {
    expect(decide(input('cust-norvi', { answers: { q_can_sign: 'no' } }))).toEqual(approved);
  });
});

describe('decide: minimum age', () => {
  it('rejects Mikko and says when he can apply (card 5)', () => {
    expect(decide(input('cust-mikko', { monthlyRentWithVatCents: 5_000 }))).toEqual({
      decision: 'rejected',
      reasons: ['min_age'],
      eligible_from: '2027-03-10',
    });
  });

  it('judges age on the start date, not today', () => {
    const on = (startOn: string) =>
      decide(input('cust-mikko', { startOn, monthlyRentWithVatCents: 5_000 })).decision;
    expect(on('2027-03-09')).toBe('rejected');
    expect(on('2027-03-10')).toBe('approved');
  });

  it('rejects a form answer that makes the applicant too young', () => {
    const result = decide(input('cust-aino', { answers: { q_birth_date: '2010-01-01' } }));
    expect(result).toMatchObject({ reasons: ['min_age'], eligible_from: '2028-01-01' });
  });

  it('is not fooled by an older birth date on the form', () => {
    const result = decide(
      input('cust-mikko', {
        answers: { q_birth_date: '1990-01-01' },
        monthlyRentWithVatCents: 5_000,
      })
    );
    expect(result).toEqual({
      decision: 'rejected',
      reasons: ['min_age'],
      eligible_from: '2027-03-10',
    });
  });

  it('applies to sole traders', () => {
    const result = decide(input('cust-pekka', { answers: { q_birth_date: '2010-01-01' } }));
    expect(result.reasons).toEqual(['min_age']);
  });

  it('has nothing to check for a company, which has no birth date', () => {
    expect(decide(input('cust-norvi')).decision).toBe('approved');
  });

  it('keeps a birth date on record in force, whatever type is answered', () => {
    const result = decide(
      input('cust-mikko', {
        answers: { q_customer_type: 'company', q_business_id: '3012456-5' },
        monthlyRentWithVatCents: 5_000,
      })
    );
    expect(result).toEqual({
      decision: 'rejected',
      reasons: ['min_age'],
      eligible_from: '2027-03-10',
    });
  });

  it('checks the answer when the record has no birth date', () => {
    const answers = { q_customer_type: 'consumer', q_birth_date: '2010-01-01' };
    const result = decide(input('cust-norvi', { answers, monthlyRentWithVatCents: 5_000 }));
    expect(result.reasons).toContain('min_age');
  });
});

describe('decide: residency', () => {
  it('rejects a country outside FI, SE and EE', () => {
    const result = decide(input('cust-aino', { answers: { q_country: 'other' } }));
    expect(result).toMatchObject({ decision: 'rejected', reasons: ['residency'] });
  });

  it('is not fooled by an allowed country on the form', () => {
    const abroad = { ...customer('cust-aino'), country: 'DE' };
    const answers = { q_country: 'FI' };
    expect(decide({ ...input('cust-aino', { answers }), customer: abroad }).reasons).toEqual([
      'residency',
    ]);
  });

  it('uses the record for a company, which is not asked', () => {
    const abroad = { ...customer('cust-norvi'), country: 'DE' };
    expect(decide({ ...input('cust-norvi'), customer: abroad }).reasons).toEqual(['residency']);
  });
});

describe('decide: affordability', () => {
  // Sanna earns 90 000 a month, so her limit is 27 000.
  it('allows rent at exactly 30 % of income', () => {
    expect(decide(input('cust-sanna', { monthlyRentWithVatCents: 27_000 }))).toEqual(approved);
  });

  it('rejects 1 cent over', () => {
    expect(decide(input('cust-sanna', { monthlyRentWithVatCents: 27_001 })).reasons).toEqual([
      'affordability',
    ]);
  });

  it('gives Sanna the cargo e-bike over 24 months but not 12', () => {
    const rent = (monthlyRentWithVatCents: number) =>
      decide(input('cust-sanna', { monthlyRentWithVatCents })).decision;
    expect(rent(25_704)).toBe('approved');
    expect(rent(39_640)).toBe('rejected');
  });

  it('uses the record when the question was not asked', () => {
    // Aino's record says 320 000, so her limit is 96 000.
    expect(decide(input('cust-aino', { monthlyRentWithVatCents: 96_000 }))).toEqual(approved);
    expect(decide(input('cust-aino', { monthlyRentWithVatCents: 96_001 })).reasons).toEqual([
      'affordability',
    ]);
  });

  it('is not fooled by a higher income on the form', () => {
    const answers = { q_monthly_income: 500_000 };
    const result = decide(input('cust-aino', { answers, monthlyRentWithVatCents: 100_000 }));
    expect(result.reasons).toEqual(['affordability']);
  });

  it('uses a lower income from the form', () => {
    const answers = { q_monthly_income: 100_000 };
    const result = decide(input('cust-aino', { answers, monthlyRentWithVatCents: 50_000 }));
    expect(result.reasons).toEqual(['affordability']);
  });

  it('rejects any rent on zero income', () => {
    const answers = { q_monthly_income: 0 };
    const result = decide(input('cust-aino', { answers, monthlyRentWithVatCents: 1 }));
    expect(result.reasons).toEqual(['affordability']);
  });

  it('does not apply to companies', () => {
    expect(decide(input('cust-norvi', { monthlyRentWithVatCents: 99_999_999 }))).toEqual(approved);
  });
});

describe('decide: business ID', () => {
  it('rejects the broken ID', () => {
    expect(decide(input('cust-broken-id'))).toMatchObject({
      decision: 'rejected',
      reasons: ['business_id'],
    });
  });

  it('is not fooled by a valid ID on the form when the record is broken', () => {
    const answers = { q_business_id: '1234567-1' };
    expect(decide(input('cust-broken-id', { answers })).reasons).toEqual(['business_id']);
  });

  it('rejects a broken ID on the form when the record is valid', () => {
    const answers = { q_business_id: '1234567-8' };
    expect(decide(input('cust-norvi', { answers })).reasons).toEqual(['business_id']);
  });

  it('does not apply to consumers', () => {
    const result = decide(input('cust-aino', { answers: { q_business_id: 'nonsense' } }));
    expect(result.decision).toBe('approved');
  });
});

describe('decide: financed limits', () => {
  it('rejects a deal that could not be priced', () => {
    expect(decide(input('cust-aino', { monthlyRentWithVatCents: null }))).toEqual({
      decision: 'rejected',
      reasons: ['financed_limits'],
      eligible_from: null,
    });
  });
});

describe('decide: the answered type', () => {
  it('applies business rules to a consumer record answering company', () => {
    const answers = { q_customer_type: 'company', q_business_id: '3012456-5' };
    const result = decide(input('cust-aino', { answers, monthlyRentWithVatCents: 99_999_999 }));
    expect(result.decision).toBe('approved');
  });

  it('needs a business ID when a consumer record answers company', () => {
    const answers = { q_customer_type: 'company' };
    expect(decide(input('cust-aino', { answers })).reasons).toEqual(['business_id']);
  });

  it('checks only the typed ID when the record has none', () => {
    const answers = { q_customer_type: 'sole_trader', q_business_id: '1234567-8' };
    expect(decide(input('cust-aino', { answers })).reasons).toEqual(['business_id']);
  });

  it('applies consumer rules to a sole trader answering consumer', () => {
    const answers = { q_customer_type: 'consumer', q_monthly_income: 100_000 };
    const result = decide(input('cust-pekka', { answers, monthlyRentWithVatCents: 50_000 }));
    expect(result.reasons).toEqual(['affordability']);
  });

  it('does not check a business ID for someone leasing as a consumer', () => {
    const answers = { q_customer_type: 'consumer', q_monthly_income: 900_000 };
    expect(decide(input('cust-broken-id', { answers })).decision).toBe('approved');
  });

  it('sends a consumer with no known income to a person, not to a rejection', () => {
    const answers = { q_customer_type: 'consumer' };
    expect(decide(input('cust-norvi', { answers }))).toEqual({
      decision: 'manual_review',
      reasons: ['income_review'],
      eligible_from: null,
    });
  });

  it('lists both reasons for a PEP whose income is unknown', () => {
    const answers = { q_customer_type: 'consumer', q_pep: 'yes' };
    expect(decide(input('cust-norvi', { answers }))).toMatchObject({
      decision: 'manual_review',
      reasons: ['pep_manual_review', 'income_review'],
    });
  });

  it('still rejects for another rule when the income is unknown', () => {
    const answers = { q_customer_type: 'consumer', q_country: 'other' };
    expect(decide(input('cust-norvi', { answers }))).toMatchObject({
      decision: 'rejected',
      reasons: ['residency'],
    });
  });

  it('counts PEP status from the record, whatever type is answered', () => {
    const answers = { q_customer_type: 'consumer', q_monthly_income: 900_000 };
    expect(decide(input('cust-haapala', { answers })).decision).toBe('manual_review');
  });

  it('falls back to the type on record when the question has no answer', () => {
    expect(decide(input('cust-broken-id')).reasons).toEqual(['business_id']);
  });
});

describe('decide: PEP', () => {
  it('sends Haapala to manual review from the record (card 7)', () => {
    expect(decide(input('cust-haapala'))).toEqual({
      decision: 'manual_review',
      reasons: ['pep_manual_review'],
      eligible_from: null,
    });
  });

  it('still goes to manual review when the form answer says no', () => {
    const result = decide(input('cust-haapala', { answers: { q_pep: 'no' } }));
    expect(result.decision).toBe('manual_review');
  });

  it('goes to manual review when the answer says yes but the record does not', () => {
    const result = decide(input('cust-aino', { answers: { q_pep: 'yes' } }));
    expect(result.decision).toBe('manual_review');
  });

  it('rejects rather than reviews a PEP who fails a rule', () => {
    const result = decide(input('cust-haapala', { monthlyRentWithVatCents: null }));
    expect(result).toEqual({
      decision: 'rejected',
      reasons: ['financed_limits'],
      eligible_from: null,
    });
  });
});

describe('decide: several reasons', () => {
  it('lists every failed rule, in the order of the rules', () => {
    const result = decide(
      input('cust-mikko', {
        answers: { q_country: 'other' },
        monthlyRentWithVatCents: 20_000,
      })
    );
    expect(result).toEqual({
      decision: 'rejected',
      reasons: ['min_age', 'residency', 'affordability'],
      eligible_from: '2027-03-10',
    });
  });
});

describe('applicantBirthDate', () => {
  it('uses the record when the form has no answer', () => {
    expect(applicantBirthDate(customer('cust-aino'), {})).toBe('1997-04-12');
  });

  it('takes the later date, whichever source it comes from', () => {
    expect(applicantBirthDate(customer('cust-aino'), { q_birth_date: '2000-01-01' })).toBe(
      '2000-01-01'
    );
    expect(applicantBirthDate(customer('cust-aino'), { q_birth_date: '1990-01-01' })).toBe(
      '1997-04-12'
    );
  });

  it('works for sole traders and gives nothing for companies', () => {
    expect(applicantBirthDate(customer('cust-pekka'), {})).toBe('1988-01-22');
    expect(applicantBirthDate(customer('cust-norvi'), {})).toBeNull();
  });
});

describe('limits read from the question bank', () => {
  const changed = (id: string, change: Partial<Question>) =>
    questions.map((q) => (q.id === id ? { ...q, ...change } : q));

  it('finds the limits in the real data', () => {
    expect(minimumAge(questions)).toBe(18);
    expect(allowedCountries(questions)).toEqual(['FI', 'SE', 'EE']);
  });

  it('follows a changed age limit, including for a birth date from the record', () => {
    const over21 = changed('q_birth_date', {
      blocks_application_when: [{ rule: 'age_under', value: 21 }],
    });
    // Sanna is 21 on 2 Nov 2025, so she passes until the limit goes above that.
    expect(decide(input('cust-sanna', { monthlyRentWithVatCents: 5_000 })).decision).toBe(
      'approved'
    );
    expect(
      decide(
        input('cust-sanna', {
          questions: over21,
          startOn: '2025-11-01',
          monthlyRentWithVatCents: 5_000,
        })
      )
    ).toEqual({ decision: 'rejected', reasons: ['min_age'], eligible_from: '2025-11-02' });
  });

  it('follows a changed country list', () => {
    const noEstonia = changed('q_country', {
      blocks_application_when: [{ rule: 'answer_in', value: ['EE', 'other'] }],
    });
    expect(decide(input('cust-lena', { questions: noEstonia })).reasons).toEqual(['residency']);
  });

  it('agrees with the rule that stops the form', () => {
    const answers = { q_birth_date: '2009-03-10', q_country: 'FI' };
    const stopped = blockingAnswer(questions, answers, '2026-11-05');
    const verdict = decide(input('cust-aino', { answers, monthlyRentWithVatCents: 5_000 }));
    expect(stopped).toMatchObject({ min_age: minimumAge(questions) });
    expect(verdict.reasons).toEqual(['min_age']);
  });

  it('fails loudly rather than rejecting everyone if a rule goes missing', () => {
    expect(() => minimumAge(questions.filter((q) => q.id !== 'q_birth_date'))).toThrow(
      /q_birth_date/
    );
    expect(() => minimumAge(changed('q_birth_date', { blocks_application_when: [] }))).toThrow(
      /minimum age/
    );
    expect(() => allowedCountries(questions.filter((q) => q.id !== 'q_country'))).toThrow(
      /q_country/
    );
  });
});
