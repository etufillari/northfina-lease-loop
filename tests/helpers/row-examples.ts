// One valid row per write schema of src/domain/rows, on the numbers of data/DATA.md's worked
// example (card 1: ebike-003, 36 months, no down payment, 5 Nov 2026). Each test changes one
// column of a copy to prove that rule; tests/schema-columns.test.ts uses them too.

export const quoteRow = () => ({
  id: 'quote-1',
  asset_id: 'ebike-003',
  quantity: 1,
  quote_date: '2026-11-05',
  valid_until: '2026-11-19',
  price_list_version: 1,
  list_price_cents: 389000,
  down_payment_cents: 0,
  financed_cents: 389000,
  band: 'B',
  factor_millionths: 27584,
  term_months: 36,
  monthly_net_cents: 10730,
  buyout_cents: 58350,
  vat_rate_bp_at_quote: 2550,
});

export const contractRow = () => ({
  id: 'contract-1',
  number: 'LL-0001',
  application_id: 'application-1',
  customer_id: 'cust-aino',
  asset_id: 'ebike-003',
  quantity: 1,
  previous_contract_id: null,
  signed_on: '2026-11-05',
  start_date: '2026-11-05',
  end_date: '2029-11-04',
  term_months: 36,
  list_price_cents: 389000,
  down_payment_cents: 0,
  financed_cents: 389000,
  band: 'B',
  factor_millionths: 27584,
  monthly_net_cents: 10730,
  buyout_cents: 58350,
  vat_rate_bp_at_signing: 2550,
  price_list_version: 1,
  status: 'active',
  ended_on: null,
});

export const invoiceRow = () => ({
  contract_id: 'contract-1',
  sequence: 1,
  period_start: '2026-11-05',
  period_end: '2026-12-04',
  issue_date: '2026-11-05',
  due_date: '2026-11-05',
  net_cents: 10730,
  vat_rate_bp: 2550,
  vat_cents: 2736,
  gross_cents: 13466,
  kind: 'rent',
  status: 'issued',
  paid_on: null,
});

export const applicationRow = () => ({
  id: 'application-1',
  customer_id: 'cust-aino',
  quote_id: 'quote-1',
  answers_json: JSON.stringify({ q_birth_date: '1990-04-12' }),
  decision: 'approved',
  reasons_json: JSON.stringify([{ code: 'all_checks_passed', params: {} }]),
  decided_on: '2026-11-05',
  reviewed_by: null,
});

export const returnAssessmentRow = () => ({
  id: 'assessment-1',
  asset_id: 'ebike-007',
  contract_id: 'contract-1',
  assessed_on: '2026-11-05',
  condition: 'fair',
  usage_value: 18400,
  refurbishment_json: JSON.stringify([{ step: 'safety_check', cost_cents: 4900 }]),
  refurbish: false,
  new_condition: 'fair',
  market_value_cents: 120000,
  second_life_financed_cents: 124900,
  matched_demand_id: 'wait-02',
  match_reasons_json: JSON.stringify([{ code: 'earliest_needed_by', params: {} }]),
  assessment_json: JSON.stringify({ options: [] }),
});
