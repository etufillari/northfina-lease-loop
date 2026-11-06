import { describe, expect, it } from 'vitest';
import { evaluateCollectedApplication } from './application-result';

const context = {
  contractStartDate: '2026-11-06',
  financedAmountCents: 30_000,
};

describe('evaluateCollectedApplication', () => {
  it('approves a complete consumer application', () => {
    expect(
      evaluateCollectedApplication(
        {
          q_customer_type: 'consumer',
          q_birth_date: '1990-01-01',
          q_country: 'FI',
        },
        context
      )
    ).toEqual({ decision: 'approved', reasons: [] });
  });

  it('declines an underage applicant', () => {
    expect(
      evaluateCollectedApplication(
        {
          q_customer_type: 'consumer',
          q_birth_date: '2008-11-07',
          q_country: 'FI',
        },
        context
      )
    ).toEqual({ decision: 'declined', reasons: ['under_minimum_age'] });
  });

  it('declines a company applicant who cannot sign', () => {
    expect(
      evaluateCollectedApplication(
        {
          q_customer_type: 'company',
          q_business_id: '0112038-9',
          q_can_sign: 'no',
        },
        context
      )
    ).toEqual({ decision: 'declined', reasons: ['unauthorised_signatory'] });
  });

  it('sends a PEP application to manual review', () => {
    expect(
      evaluateCollectedApplication(
        {
          q_customer_type: 'company',
          q_business_id: '0112038-9',
          q_can_sign: 'yes',
          q_pep: 'yes',
        },
        context
      )
    ).toEqual({ decision: 'manual_review', reasons: ['pep_manual_review'] });
  });
});
