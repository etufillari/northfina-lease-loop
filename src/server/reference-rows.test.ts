// Pure tests: no database. Checks the decimal → integer conversions and that the real
// data pack maps to the numbers the rest of the app expects.
import { describe, expect, it } from 'vitest';
import {
  loadCo2Factors,
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import type { Customer } from '@/data/schemas';
import {
  fractionToBp,
  fractionToPpm,
  percentToBp,
  toCo2Rows,
  toCoefficientRows,
  toCustomerRow,
  toPriceListRows,
  toQuestionRows,
  toRefurbishmentRows,
  toResidualRows,
  toVatRateRows,
  toWholeNumber,
} from './reference-rows';

describe('unit conversions', () => {
  it('converts percentages to basis points exactly', () => {
    expect(percentToBp(25.5)).toBe(2550);
    expect(percentToBp(9.9)).toBe(990); // 9.9 * 100 = 990.0000000000001 in floats
    expect(percentToBp(0)).toBe(0);
    expect(percentToBp(-1.5)).toBe(-150);
    expect(percentToBp(100)).toBe(10_000);
  });

  it('converts fractions to basis points and parts per million', () => {
    expect(fractionToBp(0.95)).toBe(9500);
    expect(fractionToBp(0.12)).toBe(1200);
    expect(fractionToPpm(0.027584)).toBe(27584);
    expect(fractionToPpm(0.056022)).toBe(56022);
  });

  it('never stores -0', () => {
    expect(Object.is(percentToBp(-0), 0)).toBe(true);
  });

  it('throws instead of rounding away precision', () => {
    expect(() => percentToBp(25.555)).toThrow('cannot be stored exactly');
    expect(() => fractionToPpm(0.0275845)).toThrow('parts per million');
    expect(() => toWholeNumber(165.5)).toThrow('a whole number');
    expect(() => percentToBp(Number.NaN)).toThrow();
  });
});

describe('data pack → rows', () => {
  it('flattens price lists into one entry per version and asset', async () => {
    const { priceLists, entries } = toPriceListRows(await loadPriceLists());
    expect(priceLists.map((p) => [p.version, p.valid_to])).toEqual([
      [1, '2026-11-05'],
      [2, null],
    ]);
    expect(entries).toHaveLength(60);
    expect(entries).toContainEqual({
      price_list_version: 1,
      asset_id: 'ebike-003',
      price_cents: 389000,
    });
  });

  it('maps the coefficient table to bands, factors and buyouts', async () => {
    const rows = toCoefficientRows(await loadCoefficientTable());
    expect(rows.bands).toHaveLength(4);
    expect(rows.bands[0]).toMatchObject({ band: 'A', annual_interest_bp: 990 });
    expect(rows.factors).toHaveLength(16);
    expect(rows.factors).toContainEqual({
      table_id: 'ct-2026-1',
      band: 'B',
      term_months: 36,
      factor_ppm: 27584,
    });
    expect(rows.buyouts).toContainEqual({
      table_id: 'ct-2026-1',
      term_months: 36,
      percent_bp: 1500,
    });
  });

  it('maps VAT rates with the fictional flag defaulting to false', async () => {
    const rows = toVatRateRows(await loadVatRates());
    expect(rows.map((r) => [r.rate_bp, r.fictional])).toEqual([
      [2400, false],
      [2550, false],
      [2600, true],
    ]);
  });

  it('maps residual curves, multipliers and usage adjustments', async () => {
    const rows = toResidualRows(await loadResidualCurves());
    expect(rows.curvePoints).toContainEqual({
      category: 'laptop',
      age_months: 6,
      percent_bp: 7500,
    });
    expect(rows.conditionMultipliers).toContainEqual({
      condition: 'like_new',
      multiplier_bp: 9500,
    });
    expect(rows.usageAdjustments).toContainEqual({
      category: 'laptop',
      unit: 'battery_cycles',
      percent_per_step_bp: -150,
      step: 100,
      max_total_percent_bp: -1500,
    });
  });

  it('splits refurbishment upgrades and keeps per-category fixed costs apart', async () => {
    const rows = toRefurbishmentRows(await loadRefurbishmentCosts());
    expect(rows.upgrades).toContainEqual({
      category: 'e_bike',
      from_condition: 'fair',
      to_condition: 'good',
      cost_cents: 12000,
    });
    const batteries = rows.fixedCosts.filter((c) => c.id === 'battery_replacement');
    expect(batteries.map((c) => c.category)).toEqual(['e_bike', 'laptop']);
    expect(rows.fixedCosts.find((c) => c.id === 'certified_data_wipe')).toMatchObject({
      mandatory_before_next_lease: true,
      resets_usage: false,
    });
  });

  it('keeps question order and stores nested rules as JSON', async () => {
    const file = await loadQuestions();
    const { questions, eligibilityRules } = toQuestionRows(file);
    expect(questions.map((q) => q.id)).toEqual(file.questions.map((q) => q.id));
    expect(questions.map((q) => q.position)).toEqual(file.questions.map((_, i) => i));
    const first = questions[0];
    expect(first).toMatchObject({
      id: 'q_customer_type',
      ask_when_json: '[]',
      why_we_ask_fi: null,
    });
    expect(JSON.parse(first?.options_json ?? 'null')).toEqual([
      'consumer',
      'sole_trader',
      'company',
    ]);
    expect(eligibilityRules[0]).toEqual({ id: 'min_age', position: 0, text: expect.any(String) });
  });

  it('maps CO2 factors to whole numbers and grams', async () => {
    const rows = toCo2Rows(await loadCo2Factors());
    expect(rows.manufacturing).toContainEqual({ category: 'laptop', kg_co2e: 330 });
    expect(rows.settings).toMatchObject({
      id: 1,
      refurbishment_share_of_new_bp: 1200,
      e_bike_avoided_car_g_per_km: 150,
    });
  });
});

describe('toCustomerRow', () => {
  it('fills only the columns of the customer type', async () => {
    const customers = await loadCustomers();
    const byType = (type: Customer['type']) => customers.find((c) => c.type === type);

    const consumer = toCustomerRow(byType('consumer') as Customer);
    expect(consumer).toMatchObject({
      type: 'consumer',
      business_id: null,
      applicant_can_sign: null,
    });
    expect(consumer.monthly_net_income_cents).toEqual(expect.any(Number));

    const sole = toCustomerRow(byType('sole_trader') as Customer);
    expect(sole).toMatchObject({ employment: null, annual_revenue_cents: null });
    expect(sole.birth_date).toEqual(expect.any(String));

    const company = toCustomerRow(byType('company') as Customer);
    expect(company).toMatchObject({ birth_date: null, employment: null });
    expect(company.applicant_can_sign).toEqual(expect.any(Boolean));
  });

  it('stores beneficial owners as JSON, or null when absent', () => {
    const company: Customer = {
      id: 'cust-x',
      type: 'company',
      name: 'X Oy',
      country: 'FI',
      city: 'Oulu',
      email: 'x@example.com',
      is_pep: false,
      story: 'test',
      business_id: '1234567-8',
      vat_registered: true,
      annual_revenue_cents: 100,
      applicant_can_sign: true,
    };
    expect(toCustomerRow(company).beneficial_owners_json).toBeNull();
    expect(
      toCustomerRow({ ...company, beneficial_owners: ['A', 'B'] }).beneficial_owners_json
    ).toBe('["A","B"]');
  });
});
