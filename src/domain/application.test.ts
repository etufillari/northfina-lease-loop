import { describe, expect, it } from 'vitest';
import { evaluateApplication, isValidFinnishBusinessId } from './application';

describe('isValidFinnishBusinessId', () => {
  it('accepts a valid Finnish business ID', () => {
    expect(isValidFinnishBusinessId('0112038-9')).toBe(true);
    expect(isValidFinnishBusinessId(' 0112038-9 ')).toBe(true);
  });

  it('rejects a wrong check digit and malformed value', () => {
    expect(isValidFinnishBusinessId('0112038-8')).toBe(false);
    expect(isValidFinnishBusinessId('112038-9')).toBe(false);
  });
});

describe('evaluateApplication', () => {
  const consumer = {
    customerType: 'consumer' as const,
    contractStartDate: '2026-11-05',
    birthDate: '1990-01-01',
    country: 'FI',
    financedAmountCents: 389_000,
    monthlyRentWithVatCents: 13_466,
    monthlyNetIncomeCents: 250_000,
    isPep: false,
  };

  it('approves an affordable consumer application', () => {
    expect(evaluateApplication(consumer)).toEqual({ decision: 'approved', reasons: [] });
  });

  it('declines an underage applicant', () => {
    expect(evaluateApplication({ ...consumer, birthDate: '2008-11-06' })).toEqual({
      decision: 'declined',
      reasons: ['under_minimum_age'],
    });
  });

  it('declines an unaffordable application using integer cents', () => {
    expect(evaluateApplication({ ...consumer, monthlyNetIncomeCents: 40_000 })).toEqual({
      decision: 'declined',
      reasons: ['unaffordable'],
    });
  });

  it('sends a politically exposed person to manual review', () => {
    expect(evaluateApplication({ ...consumer, isPep: true })).toEqual({
      decision: 'manual_review',
      reasons: ['pep_manual_review'],
    });
  });

  it('declines a company application when the applicant cannot sign', () => {
    expect(
      evaluateApplication({
        customerType: 'company',
        contractStartDate: '2026-11-05',
        country: 'FI',
        financedAmountCents: 14_500_000,
        businessId: '0112038-9',
        applicantCanSign: false,
        isPep: false,
      })
    ).toEqual({ decision: 'declined', reasons: ['unauthorised_signatory'] });
  });

  it('declines an unsupported country and invalid business ID', () => {
    expect(
      evaluateApplication({
        customerType: 'company',
        contractStartDate: '2026-11-05',
        country: 'US',
        financedAmountCents: 1_000_000,
        businessId: '1234567-8',
        applicantCanSign: true,
        isPep: false,
      })
    ).toEqual({
      decision: 'declined',
      reasons: ['unsupported_residency', 'invalid_business_id'],
    });
  });
});
