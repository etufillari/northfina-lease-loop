import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { decide, type EligibilityInput } from './eligibility';

// Tests run against the real data pack, so they also catch a changed customer.
let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});

function customer(id: string): Customer {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

const input = (id: string, overrides: Partial<EligibilityInput> = {}): EligibilityInput => ({
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

  it('uses the form answer over the record', () => {
    const result = decide(input('cust-aino', { answers: { q_birth_date: '2010-01-01' } }));
    expect(result).toMatchObject({ reasons: ['min_age'], eligible_from: '2028-01-01' });
  });

  it('applies to sole traders', () => {
    const result = decide(input('cust-pekka', { answers: { q_birth_date: '2010-01-01' } }));
    expect(result.reasons).toEqual(['min_age']);
  });

  it('does not apply to companies', () => {
    const result = decide(input('cust-norvi', { answers: { q_birth_date: '2010-01-01' } }));
    expect(result.decision).toBe('approved');
  });
});

describe('decide: residency', () => {
  it('rejects a country outside FI, SE and EE', () => {
    const result = decide(input('cust-aino', { answers: { q_country: 'other' } }));
    expect(result).toMatchObject({ decision: 'rejected', reasons: ['residency'] });
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

  it('uses the income answer when asked, and the record below that', () => {
    // Aino's record says 320 000, so her limit is 96 000.
    const rent = { monthlyRentWithVatCents: 100_000 };
    expect(decide(input('cust-aino', rent)).reasons).toEqual(['affordability']);
    const answers = { q_monthly_income: 500_000 };
    expect(decide(input('cust-aino', { ...rent, answers })).decision).toBe('approved');
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

  it('uses the form answer over the record', () => {
    expect(decide(input('cust-broken-id', { answers: { q_business_id: '1234567-1' } }))).toEqual(
      approved
    );
    expect(
      decide(input('cust-norvi', { answers: { q_business_id: '1234567-8' } })).reasons
    ).toEqual(['business_id']);
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
