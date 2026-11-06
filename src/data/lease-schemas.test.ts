import { describe, expect, it } from 'vitest';
import { loadQuestions } from './load';
import {
  answersSchema,
  applicationSchema,
  assetLifeSchema,
  contractSchema,
  contractStatusSchema,
  eligibilityReasonSchema,
  invoiceSchema,
  lifeOutcomeSchema,
  quoteSchema,
} from './lease-schemas';

const quote = {
  price_list_version: 2,
  base_price_cents: 389000,
  down_payment_cents: 0,
  financed_cents: 389000,
  term_months: 36,
  band: 'B',
  factor_micros: 27584,
  annual_interest_basis_points: 790,
  monthly_net_rent_cents: 10730,
  buyout_cents: 58350,
};

const application = {
  id: 'app-1',
  customer_id: 'cust-aino',
  asset_id: 'ebike-003',
  quote_date: '2026-11-05',
  start_on: '2026-11-05',
  price_list_version: 2,
  base_price_cents: 389000,
  down_payment_cents: 0,
  financed_cents: 389000,
  term_months: 36,
  answers: { q_country: 'FI', q_monthly_income: 320000, q_beneficial_owners: ['Aino'] },
  decision: 'approved',
  reasons: [],
  reviewed_by: null,
  reviewed_on: null,
};

const contract = {
  ...quote,
  id: 'con-1',
  application_id: 'app-1',
  customer_id: 'cust-aino',
  asset_id: 'ebike-003',
  quote_date: '2026-11-05',
  signed_on: '2026-11-05',
  signed_by: 'cust-aino',
  start_on: '2026-11-05',
  planned_end_on: '2029-11-04',
  actual_end_on: null,
  status: 'active',
};

const invoice = {
  id: 'inv-1',
  contract_id: 'con-1',
  sequence: 3,
  kind: 'rent',
  period_start: '2027-01-05',
  period_end: '2027-02-04',
  invoice_date: '2027-01-05',
  due_date: '2027-01-19',
  net_cents: 10730,
  vat_rate_basis_points: 2600,
  vat_cents: 2790,
  total_cents: 13520,
  status: 'issued',
};

const pastLife = {
  id: 'life-1',
  asset_id: 'ebike-007',
  life_number: 1,
  contract_id: null,
  first_lease_price_cents: null,
  started_on: null,
  ended_on: null,
  outcome: null,
  start_condition: null,
  start_usage_value: null,
  end_condition: null,
  end_usage_value: null,
};

describe('lease records', () => {
  it('accepts a valid record of each kind', () => {
    expect(quoteSchema.safeParse(quote).success).toBe(true);
    expect(applicationSchema.safeParse(application).success).toBe(true);
    expect(contractSchema.safeParse(contract).success).toBe(true);
    expect(invoiceSchema.safeParse(invoice).success).toBe(true);
    expect(assetLifeSchema.safeParse(pastLife).success).toBe(true);
  });

  it('accepts a re-listed item, which has no price list version', () => {
    expect(quoteSchema.safeParse({ ...quote, price_list_version: null }).success).toBe(true);
  });

  it('rejects money that is not whole cents', () => {
    expect(invoiceSchema.safeParse({ ...invoice, vat_cents: 2789.5 }).success).toBe(false);
  });

  it('rejects rates stored as fractions', () => {
    expect(invoiceSchema.safeParse({ ...invoice, vat_rate_basis_points: 25.5 }).success).toBe(
      false
    );
    expect(quoteSchema.safeParse({ ...quote, factor_micros: 0.027584 }).success).toBe(false);
  });

  it('rejects unknown decisions, statuses and dates', () => {
    expect(applicationSchema.safeParse({ ...application, decision: 'maybe' }).success).toBe(false);
    expect(contractSchema.safeParse({ ...contract, status: 'paused' }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...invoice, status: 'overdue' }).success).toBe(false);
    expect(contractSchema.safeParse({ ...contract, start_on: '5.11.2026' }).success).toBe(false);
  });

  it('limits the size of an answer', () => {
    expect(answersSchema.safeParse({ q_x: 'a'.repeat(1000) }).success).toBe(true);
    expect(answersSchema.safeParse({ q_x: 'a'.repeat(1001) }).success).toBe(false);
    expect(answersSchema.safeParse({ q_x: Array(50).fill('owner') }).success).toBe(true);
    expect(answersSchema.safeParse({ q_x: Array(51).fill('owner') }).success).toBe(false);
    expect(answersSchema.safeParse({ q_x: ['a'.repeat(1001)] }).success).toBe(false);
  });

  it('rejects answers to something that is not a question id', () => {
    expect(answersSchema.safeParse({ country: 'FI' }).success).toBe(false);
  });
});

describe('allowed values', () => {
  it('has an eligibility reason for exactly the rules in the data pack', async () => {
    const { eligibility_rules: rules } = await loadQuestions();
    expect([...eligibilityReasonSchema.options].sort()).toEqual(
      rules.map((rule) => rule.id).sort()
    );
  });

  it('gives a contract every life outcome as a status, plus active', () => {
    expect(contractStatusSchema.options).toEqual(['active', ...lifeOutcomeSchema.options]);
  });
});
