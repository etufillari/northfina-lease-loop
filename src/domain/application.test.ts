import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists, loadQuestions } from '@/data/load';
import type { AssetCategory, CoefficientTable, PriceList, Question } from '@/data/schemas';
import { decideApplication, questionContext } from './application';
import { listPriceOn } from './price-list';
import { quoteLease } from './pricing';
import { getVisibleQuestions } from './question-flow';

let table: CoefficientTable;
let priceLists: PriceList[];
let questions: Question[];
beforeAll(async () => {
  [table, priceLists, questions] = await Promise.all([
    loadCoefficientTable(),
    loadPriceLists(),
    loadQuestions().then((file) => file.questions),
  ]);
});

const TODAY = '2026-11-05';

/** The engine's context for leasing `assetId` on 5 Nov 2026, priced from the data pack. */
function contextFor(
  assetId: string,
  category: AssetCategory,
  termMonths: number,
  downPaymentCents = 0
) {
  const price = listPriceOn(priceLists, assetId, TODAY);
  if (!price.ok) throw new Error(`no price for ${assetId}`);
  const result = quoteLease(
    { listPriceCents: price.priceCents, downPaymentCents, termMonths, vatPercent: 25.5 },
    table
  );
  if (!result.ok) throw new Error(`cannot quote ${assetId}: ${result.reason}`);
  return questionContext({ category, quote: result.quote, todayIso: TODAY, table });
}

describe('questionContext', () => {
  it('takes the financed amount, term and monthly price incl. VAT from the quote', () => {
    expect(contextFor('ebike-003', 'e_bike', 36)).toEqual({
      category: 'e_bike',
      financedAmountCents: 389_000,
      termMonths: 36,
      monthlyRentInclVatCents: 13_466,
      todayIso: TODAY,
      minFinancedCents: 30_000,
      maxFinancedCents: 25_000_000,
    });
  });
});

describe('decideApplication with the scenario cards', () => {
  it('card 1: approves Aino for ebike-003 when every question is answered', () => {
    const context = contextFor('ebike-003', 'e_bike', 36);
    const answers = {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: '3200',
      q_usage_purpose: 'commuting',
    };
    expect(decideApplication(questions, answers, context).evaluation).toEqual({
      status: 'approved',
      reasons: [],
    });
  });

  it('card 5: says no to Mikko (17) for laptop-008, because of his age', () => {
    const context = contextFor('laptop-008', 'laptop', 36);
    const { evaluation } = decideApplication(
      questions,
      { q_customer_type: 'consumer', q_birth_date: '2009-03-10' },
      context
    );
    expect(evaluation.status).toBe('rejected');
    expect(evaluation.reasons.map((r) => r.ruleId)).toEqual(['min_age']);
  });

  it('card 6: sends Norvi to a person when the applicant cannot sign for the company', () => {
    const context = contextFor('ebike-004', 'e_bike', 36);
    const { evaluation } = decideApplication(
      questions,
      {
        q_customer_type: 'company',
        q_business_id: '3299871-7',
        q_company_name: 'Norvi Logistics Oy',
        q_can_sign: 'no',
      },
      context
    );
    expect(evaluation.status).toBe('manual_review');
    expect(evaluation.reasons.map((r) => r.ruleId)).toEqual(['signatory_authorization']);
  });

  it('card 7: asks Haapala the big-ticket questions and ends in manual review for the PEP', () => {
    // farm-002 €145,000 with €20,000 down → €125,000 financed for 48 months
    const context = contextFor('farm-002', 'farm_machine', 48, 2_000_000);
    const answers = { q_customer_type: 'company', q_pep: 'yes' };
    const visible = getVisibleQuestions(questions, answers, context).map((q) => q.id);
    expect(visible).toEqual(
      expect.arrayContaining([
        'q_annual_revenue',
        'q_beneficial_owners',
        'q_farm_registry',
        'q_pep',
        'q_pep_details',
      ])
    );
    const { evaluation } = decideApplication(questions, answers, context);
    expect(evaluation.status).toBe('manual_review');
    expect(evaluation.reasons.map((r) => r.ruleId)).toEqual(['pep_manual_review']);
  });

  it('drops answers that stop applying when the customer changes an earlier answer', () => {
    const context = contextFor('ebike-004', 'e_bike', 36);
    const { answers } = decideApplication(
      questions,
      // switched from company to consumer: the company answers no longer apply
      { q_customer_type: 'consumer', q_can_sign: 'no', q_signatory_email: 'x@example.com' },
      context
    );
    expect(answers).toEqual({ q_customer_type: 'consumer' });
  });

  it('is incomplete, not approved, while questions are unanswered', () => {
    const context = contextFor('ebike-003', 'e_bike', 36);
    expect(
      decideApplication(questions, { q_customer_type: 'consumer' }, context).evaluation.status
    ).toBe('incomplete');
  });
});
