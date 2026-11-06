import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadCustomers } from '@/data/load';
import type { CoefficientTable, Customer } from '@/data/schemas';
import type { EligibilityInput } from './eligibility';
import { evaluateEligibility } from './eligibility';

let table: CoefficientTable;
let customers: Customer[];
beforeAll(async () => {
  table = await loadCoefficientTable();
  customers = await loadCustomers();
});

const aino = (): EligibilityInput => ({
  customerType: 'consumer',
  birthDate: '1997-04-12',
  country: 'FI',
  businessId: null,
  monthlyNetIncomeCents: 320_000,
  pepAnswer: null,
  applicationDate: '2026-11-05',
  financedCents: 389_000,
  termMonths: 36,
  newPayments: [{ dueDate: '2026-11-05', totalCents: 13_466 }],
  table,
});

describe('evaluateEligibility', () => {
  it('approves the happy path (scenario card 1) with every reason visible', () => {
    const result = evaluateEligibility(aino());
    expect(result.decision).toBe('approved');
    expect(result.reasons.map((r) => [r.rule, r.outcome])).toEqual([
      ['min_age', 'passed'],
      ['residency', 'passed'],
      ['affordability', 'passed'],
      ['business_id', 'not_applicable'],
      ['pep_manual_review', 'not_applicable'],
      ['financed_limits', 'passed'],
    ]);
  });

  it('scenario card 5: declines Mikko with the date he becomes eligible', () => {
    const result = evaluateEligibility({
      ...aino(),
      birthDate: '2009-03-10',
      applicationDate: '2026-11-20',
      monthlyNetIncomeCents: null,
    });
    expect(result.decision).toBe('declined');
    const minAge = result.reasons.find((r) => r.rule === 'min_age');
    expect(minAge).toMatchObject({ outcome: 'failed', params: { eligibleFrom: '2027-03-10' } });
  });

  it('declines someone who would be 18 by the start date but is 17 on the day they apply', () => {
    // Turns 18 on 20 Jan 2027; a lease starting 25 Jan would still be signed by a minor.
    const result = evaluateEligibility({
      ...aino(),
      birthDate: '2009-01-20',
      applicationDate: '2026-11-05',
    });
    expect(result.decision).toBe('declined');
    expect(result.reasons.find((r) => r.rule === 'min_age')).toMatchObject({
      outcome: 'failed',
      params: { age: 17, eligibleFrom: '2027-01-20' },
    });
    // On the birthday itself they may apply.
    const onTheDay = evaluateEligibility({
      ...aino(),
      birthDate: '2009-01-20',
      applicationDate: '2027-01-20',
    });
    expect(onTheDay.reasons.find((r) => r.rule === 'min_age')?.outcome).toBe('passed');
  });

  it('scenario card 7: a PEP answer sends Haapala to manual review, never auto-approval', () => {
    const haapala = customers.find((c) => c.id === 'cust-haapala');
    if (haapala?.type !== 'company') throw new Error('expected the Haapala company');
    const result = evaluateEligibility({
      customerType: 'company',
      birthDate: null,
      country: null,
      businessId: haapala.business_id,
      monthlyNetIncomeCents: null,
      pepAnswer: 'yes',
      applicationDate: '2026-11-10',
      financedCents: 12_500_000,
      termMonths: 48,
      newPayments: [{ dueDate: '2026-11-10', totalCents: 330_000 }],
      table,
    });
    expect(result.decision).toBe('manual_review');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'pep_manual_review', outcome: 'manual_review' }),
        expect.objectContaining({ rule: 'business_id', outcome: 'passed' }),
      ])
    );
  });

  it('declines an unaffordable deal, with the limit in the reason', () => {
    const result = evaluateEligibility({
      ...aino(),
      newPayments: [{ dueDate: '2026-11-05', totalCents: 96_001 }],
    });
    expect(result.decision).toBe('declined');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'affordability',
          outcome: 'failed',
          params: expect.objectContaining({ limitCents: 96_000 }),
        }),
      ])
    );
  });

  it('passes affordability when income was never asked, saying so', () => {
    const result = evaluateEligibility({ ...aino(), monthlyNetIncomeCents: null });
    expect(result.decision).toBe('approved');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'affordability',
          outcome: 'passed',
          params: { note: 'income_not_asked' },
        }),
      ])
    );
  });

  it('declines the broken business ID', () => {
    const result = evaluateEligibility({
      ...aino(),
      customerType: 'sole_trader',
      businessId: '1234567-8',
    });
    expect(result.decision).toBe('declined');
  });

  it('a decline wins over a manual-review flag', () => {
    const result = evaluateEligibility({
      ...aino(),
      pepAnswer: 'yes',
      newPayments: [{ dueDate: '2026-11-05', totalCents: 96_001 }],
    });
    expect(result.decision).toBe('declined');
  });

  it('declines an amount outside the coefficient bands', () => {
    const result = evaluateEligibility({ ...aino(), financedCents: 29_999 });
    expect(result.decision).toBe('declined');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'financed_limits', outcome: 'failed' }),
      ])
    );
  });
});
