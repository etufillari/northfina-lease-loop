import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadCustomers, loadPriceLists, loadQuestions } from '@/data/load';
import type {
  AssetCategory,
  CoefficientTable,
  Customer,
  PriceList,
  Question,
} from '@/data/schemas';
import { decideApplication, questionContext } from './application';
import { prefillAnswers } from './prefill';
import { listPriceOn } from './price-list';
import { quoteLease } from './pricing';

let table: CoefficientTable;
let priceLists: PriceList[];
let questions: Question[];
let customers: Customer[];
beforeAll(async () => {
  [table, priceLists, questions, customers] = await Promise.all([
    loadCoefficientTable(),
    loadPriceLists(),
    loadQuestions().then((file) => file.questions),
    loadCustomers(),
  ]);
});

const TODAY = '2026-11-05';
const customer = (id: string) => {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
};

/** Decides `customerId`'s application for `assetId` using only their pre-filled answers. */
function decide(
  customerId: string,
  assetId: string,
  category: AssetCategory,
  termMonths: number,
  downPaymentCents = 0,
  extra: Record<string, string> = {}
) {
  const price = listPriceOn(priceLists, assetId, TODAY);
  if (!price.ok) throw new Error(`no price for ${assetId}`);
  const quoted = quoteLease(
    { listPriceCents: price.priceCents, downPaymentCents, termMonths, vatPercent: 25.5 },
    table
  );
  if (!quoted.ok) throw new Error(quoted.reason);
  const context = questionContext({ category, quote: quoted.quote, todayIso: TODAY, table });
  return decideApplication(
    questions,
    { ...prefillAnswers(customer(customerId)), ...extra },
    context
  ).evaluation;
}

describe('prefillAnswers', () => {
  it('fills a consumer’s personal details, with income in euros', () => {
    expect(prefillAnswers(customer('cust-aino'))).toEqual({
      q_customer_type: 'consumer',
      q_email: 'aino.virtanen@example.com',
      q_pep: 'no',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: '3200',
    });
  });

  it('fills a sole trader’s business details', () => {
    expect(prefillAnswers(customer('cust-pekka'))).toMatchObject({
      q_customer_type: 'sole_trader',
      q_full_name: 'Pekka Korhonen',
      q_business_id: '3012456-5',
      q_vat_registered: 'yes',
    });
  });

  it('fills a company’s details, including owners and who can sign', () => {
    expect(prefillAnswers(customer('cust-haapala'))).toMatchObject({
      q_customer_type: 'company',
      q_company_name: 'Haapalan Tila Oy',
      q_can_sign: 'yes',
      q_annual_revenue: '950000',
      q_beneficial_owners: 'Jussi Haapala (60 %), Maria Haapala (40 %)',
      q_pep: 'yes',
    });
  });

  it('leaves out owners when a company has none listed', () => {
    expect(prefillAnswers(customer('cust-norvi'))).not.toHaveProperty('q_beneficial_owners');
  });
});

describe('pre-filled customers through the scenario cards', () => {
  it('card 1: Aino only needs to say what the e-bike is for, then she is approved', () => {
    expect(decide('cust-aino', 'ebike-003', 'e_bike', 36).status).toBe('incomplete');
    expect(
      decide('cust-aino', 'ebike-003', 'e_bike', 36, 0, { q_usage_purpose: 'commuting' })
    ).toEqual({ status: 'approved', reasons: [] });
  });

  it('card 5: Mikko is refused straight away because he is 17', () => {
    expect(decide('cust-mikko', 'laptop-008', 'laptop', 36)).toMatchObject({
      status: 'rejected',
      reasons: [expect.objectContaining({ ruleId: 'min_age' })],
    });
  });

  it('card 6: Norvi goes to a person because the applicant cannot sign', () => {
    expect(decide('cust-norvi', 'ebike-004', 'e_bike', 36).status).toBe('manual_review');
  });

  it('card 7: Haapala goes to a person because an owner is a PEP', () => {
    const evaluation = decide('cust-haapala', 'farm-002', 'farm_machine', 48, 2_000_000);
    expect(evaluation.status).toBe('manual_review');
    expect(evaluation.reasons.map((r) => r.ruleId)).toEqual(['pep_manual_review']);
  });

  it('refuses Typo Trading for its broken business ID', () => {
    expect(
      decide('cust-broken-id', 'laptop-001', 'laptop', 24).reasons.map((r) => r.ruleId)
    ).toContain('business_id');
  });

  it('Sanna can afford the cargo bike over 36 months but not over 12', () => {
    const extra = { q_usage_purpose: 'commuting' };
    expect(decide('cust-sanna', 'ebike-004', 'e_bike', 36, 0, extra).status).toBe('approved');
    expect(decide('cust-sanna', 'ebike-004', 'e_bike', 12, 0, extra)).toMatchObject({
      status: 'rejected',
      reasons: [expect.objectContaining({ ruleId: 'affordability' })],
    });
  });
});
