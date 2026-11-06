import { describe, expect, it } from 'vitest';
import type { Asset, Customer } from '@/data/schemas';
import { decideApplication } from './application';

const asset: Asset = {
  id: 'ebike-003',
  category: 'e_bike',
  make: 'Northfina',
  model: 'Loop',
  model_year: 2026,
  serial_number: 'SN-003',
  condition: 'new',
  usage: { unit: 'km', value: 0 },
  previous_lives: 0,
  status: 'available',
};

const aino: Customer = {
  id: 'cust-aino',
  type: 'consumer',
  name: 'Aino Virtanen',
  birth_date: '1997-04-12',
  country: 'FI',
  city: 'Helsinki',
  email: 'aino.virtanen@example.com',
  employment: 'employed',
  monthly_net_income_cents: 320000,
  is_pep: false,
  story: 'The happy path.',
};

describe('decideApplication', () => {
  it('approves an affordable adult with a positive rent', () => {
    expect(
      decideApplication({ customer: aino, asset, monthlyNetCents: 10730, asOf: '2026-11-05' })
    ).toEqual({ status: 'APPROVED', reason: 'Eligibility checks passed', signingAuthority: true });
  });

  it('rejects unavailable assets and underage applicants', () => {
    expect(
      decideApplication({
        customer: aino,
        asset: { ...asset, status: 'reserved' },
        monthlyNetCents: 10730,
        asOf: '2026-11-05',
      }).reason
    ).toBe('Asset is unavailable');
    expect(
      decideApplication({
        customer: { ...aino, birth_date: '2009-03-10' },
        asset,
        monthlyNetCents: 10730,
        asOf: '2026-11-05',
      }).reason
    ).toBe('Applicant must be at least 18 years old');
  });

  it('sends PEPs to manual review and blocks unauthorized company signers', () => {
    const company: Customer = {
      id: 'cust-norvi',
      type: 'company',
      name: 'Norvi Logistics Oy',
      business_id: '3299871-7',
      country: 'FI',
      city: 'Vantaa',
      email: 'fleet@example.com',
      vat_registered: true,
      annual_revenue_cents: 410000000,
      applicant_can_sign: false,
      is_pep: false,
      story: 'No authority',
    };
    expect(
      decideApplication({ customer: company, asset, monthlyNetCents: 10730, asOf: '2026-11-05' })
    ).toEqual({
      status: 'MANUAL_REVIEW',
      reason: 'Applicant signing authority must be confirmed',
      signingAuthority: false,
    });
    expect(
      decideApplication({
        customer: { ...company, is_pep: true, applicant_can_sign: true },
        asset,
        monthlyNetCents: 10730,
        asOf: '2026-11-05',
      }).status
    ).toBe('MANUAL_REVIEW');
  });

  it('rejects malformed business IDs and invalid rent', () => {
    const company: Customer = {
      id: 'cust-broken-id',
      type: 'company',
      name: 'Typo Trading Oy',
      business_id: '1234567-8',
      country: 'FI',
      city: 'Turku',
      email: 'hello@example.com',
      vat_registered: false,
      annual_revenue_cents: 12000000,
      applicant_can_sign: true,
      is_pep: false,
      story: 'Bad ID',
    };
    expect(
      decideApplication({ customer: company, asset, monthlyNetCents: 10730, asOf: '2026-11-05' })
        .reason
    ).toBe('Customer business ID is invalid');
    expect(
      decideApplication({ customer: aino, asset, monthlyNetCents: 0, asOf: '2026-11-05' }).reason
    ).toBe('Monthly net rent must be a positive whole number of cents');
  });
});
