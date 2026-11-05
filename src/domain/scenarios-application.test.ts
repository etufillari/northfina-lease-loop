// Scenario cards 5–7 from CHALLENGE.md §4: the application, run against the real data pack.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadVatRates,
} from '@/data/load';
import type {
  Asset,
  CoefficientTable,
  Customer,
  PriceList,
  Question,
  VatRates,
} from '@/data/schemas';
import { decideApplication } from './eligibility';
import { invoiceSchedule } from './invoicing';
import { answersFromCustomer } from './persona';
import { askedQuestions, nextQuestion, type Answers, type Deal } from './question-flow';
import { makeQuote } from './quote';

let table: CoefficientTable;
let priceLists: PriceList[];
let vatRates: VatRates;
let questions: Question[];
let customers: Customer[];
let assets: Asset[];
beforeAll(async () => {
  [table, priceLists, vatRates, questions, customers, assets] = await Promise.all([
    loadCoefficientTable(),
    loadPriceLists(),
    loadVatRates(),
    loadQuestions().then((file) => file.questions),
    loadCustomers(),
    loadAssets(),
  ]);
});

/** Prices the lease on the start date and returns the deal and its highest monthly total. */
function application(assetId: string, startDate: string, termMonths: number, downPaymentCents = 0) {
  const asset = assets.find((a) => a.id === assetId);
  const made = makeQuote(priceLists, table, {
    assetId,
    quoteDate: startDate,
    termMonths,
    downPaymentCents,
  });
  if (!asset || !made.ok) throw new Error(`cannot price ${assetId}`);
  const schedule = invoiceSchedule(
    {
      startDate,
      termMonths,
      monthlyNetRentCents: made.quote.monthlyNetRentCents,
      billing: 'start_day_full_months',
    },
    vatRates
  );
  if (!schedule.ok) throw new Error('no schedule');
  const deal: Deal = {
    category: asset.category,
    financedAmountCents: made.quote.financedCents,
    termMonths,
  };
  return {
    deal,
    startDate,
    highestMonthlyGrossCents: Math.max(...schedule.invoices.map((i) => i.grossCents)),
  };
}

function personaAnswers(customerId: string, extra: Answers = {}): Answers {
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) throw new Error(customerId);
  return { ...answersFromCustomer(customer), ...extra };
}

describe('card 5, too young: Mikko (17) applies for laptop-008', () => {
  it('declines on age alone and tells him the date he can apply', () => {
    // 289 000 over 36 m: 7 972 net, 10 045 with 26 % VAT, under his 12 000 cap (30 % of 40 000).
    // Born 10 Mar 2009, so he is 18 from 10 Mar 2027.
    const app = application('laptop-008', '2026-11-05', 36);
    expect(app.highestMonthlyGrossCents).toBe(10_045);
    expect(decideApplication(questions, { ...app, answers: personaAnswers('cust-mikko') })).toEqual(
      {
        status: 'decided',
        outcome: 'declined',
        reasons: [
          { rule: 'min_age', questionId: 'q_birth_date', minAge: 18, eligibleFrom: '2027-03-10' },
        ],
        signer: { kind: 'applicant' },
      }
    );
  });
});

describe('card 6, who can sign: Norvi Logistics applies for ebike-004', () => {
  it('asks for the signatory’s email, then sends the contract to them to sign', () => {
    const app = application('ebike-004', '2026-11-05', 36);
    const answers = personaAnswers('cust-norvi', { q_usage_purpose: 'delivery' });
    expect(nextQuestion(questions, app.deal, answers)?.id).toBe('q_signatory_email');

    const complete = { ...answers, q_signatory_email: 'ceo@norvi.example.com' };
    expect(decideApplication(questions, { ...app, answers: complete })).toMatchObject({
      outcome: 'approved',
      signer: { kind: 'signatory', email: 'ceo@norvi.example.com' },
    });
  });
});

describe('card 7, big ticket: Haapalan Tila leases farm-002 with 20 000 € down', () => {
  it('asks the farm, revenue, ownership and PEP questions, then ends in manual review', () => {
    // 12 500 000 financed: over 50 000 € (revenue, owners) and 10 000 € (PEP); a farm machine.
    const app = application('farm-002', '2026-11-05', 48, 2_000_000);
    const answers = personaAnswers('cust-haapala', {
      q_farm_registry: 'FR-123456',
      q_pep_details: 'Municipal council member since 2021',
    });
    expect(askedQuestions(questions, app.deal, answers).map((q) => q.id)).toEqual([
      'q_customer_type',
      'q_email',
      'q_business_id',
      'q_company_name',
      'q_can_sign',
      'q_vat_registered',
      'q_farm_registry',
      'q_annual_revenue',
      'q_beneficial_owners',
      'q_pep',
      'q_pep_details',
    ]);
    expect(decideApplication(questions, { ...app, answers })).toMatchObject({
      outcome: 'manual_review',
      reasons: [{ rule: 'pep_manual_review' }],
    });
  });
});

describe('data-pack trap: Typo Trading’s business ID', () => {
  it('stops at the business ID, whose check digit is wrong', () => {
    const app = application('laptop-001', '2026-11-05', 24);
    expect(
      decideApplication(questions, { ...app, answers: personaAnswers('cust-broken-id') })
    ).toEqual({ status: 'invalid', questionId: 'q_business_id', reason: 'invalid_business_id' });
  });
});
