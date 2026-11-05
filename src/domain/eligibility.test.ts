import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { Question } from '@/data/schemas';
import { decideApplication, type ApplicationInput } from './eligibility';
import type { Answers, Deal } from './question-flow';

let questions: Question[];
beforeAll(async () => {
  questions = (await loadQuestions()).questions;
});

const ebike: Deal = { category: 'e_bike', financedAmountCents: 189_900, termMonths: 36 };
const aino: Answers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino.virtanen@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_usage_purpose: 'commuting',
};
const decide = (overrides: Partial<ApplicationInput>) =>
  decideApplication(questions, {
    deal: ebike,
    answers: aino,
    startDate: '2026-11-05',
    highestMonthlyGrossCents: 10_000,
    ...overrides,
  });

describe('decideApplication', () => {
  it('approves a complete application that breaks no rule, signed by the applicant', () => {
    expect(decide({})).toEqual({
      status: 'decided',
      outcome: 'approved',
      reasons: [],
      signer: { kind: 'applicant' },
    });
  });

  it('is incomplete until every question that applies has an answer', () => {
    const { q_country: _country, ...missing } = aino;
    expect(decide({ answers: missing })).toEqual({
      status: 'incomplete',
      nextQuestionId: 'q_country',
    });
  });

  it('reports an invalid answer instead of deciding on it', () => {
    expect(decide({ answers: { ...aino, q_email: 'not-an-email' } })).toEqual({
      status: 'invalid',
      questionId: 'q_email',
      reason: 'invalid_email',
    });
  });

  it('declines an applicant under 18 on the start date and says when they can apply (card 5)', () => {
    // Mikko, born 10 Mar 2009, turns 18 on 10 Mar 2027.
    const mikko = { ...aino, q_full_name: 'Mikko Laine', q_birth_date: '2009-03-10' };
    expect(decide({ answers: mikko })).toMatchObject({
      outcome: 'declined',
      reasons: [{ rule: 'min_age', minAge: 18, eligibleFrom: '2027-03-10' }],
    });
    // A lease starting on his birthday is fine; the day before is not.
    expect(decide({ answers: mikko, startDate: '2027-03-10' })).toMatchObject({
      outcome: 'approved',
    });
    expect(decide({ answers: mikko, startDate: '2027-03-09' })).toMatchObject({
      outcome: 'declined',
    });
  });

  it('declines a country outside Finland, Sweden and Estonia', () => {
    expect(decide({ answers: { ...aino, q_country: 'other' } })).toMatchObject({
      outcome: 'declined',
      reasons: [{ rule: 'blocked_answer', questionId: 'q_country', answer: 'other' }],
    });
  });

  it('lets a consumer’s highest monthly total be at most 30 % of net income, inclusive', () => {
    // Income 100 000 → at most 30 000 a month with VAT.
    const withIncome = { ...aino, q_monthly_income: 100_000 };
    const deal: Deal = { ...ebike, financedAmountCents: 549_000 };
    expect(decide({ deal, answers: withIncome, highestMonthlyGrossCents: 30_000 })).toMatchObject({
      outcome: 'approved',
    });
    expect(decide({ deal, answers: withIncome, highestMonthlyGrossCents: 30_001 })).toMatchObject({
      outcome: 'declined',
      reasons: [{ rule: 'affordability', monthlyGrossCents: 30_001, maxMonthlyGrossCents: 30_000 }],
    });
  });

  it('declines Sanna’s cargo bike over 12 months: 379.07 € a month is more than 30 % of 900 €', () => {
    // ebike-004 549 000, 12 m band B: 549 000 × 0.054799 = 30 084.65 → 30 085 net;
    // at 26 % VAT (2027 is inside the term) 7 822.1 → 7 822, so 37 907 a month. Cap 27 000.
    const sanna = {
      ...aino,
      q_birth_date: '2004-11-02',
      q_employment: 'student',
      q_monthly_income: 90_000,
    };
    const deal: Deal = { category: 'e_bike', financedAmountCents: 549_000, termMonths: 12 };
    expect(decide({ deal, answers: sanna, highestMonthlyGrossCents: 37_907 })).toMatchObject({
      outcome: 'declined',
      reasons: [{ rule: 'affordability', maxMonthlyGrossCents: 27_000 }],
    });
  });

  it('sends a politically exposed person to manual review, never auto-approves (card 7)', () => {
    const deal: Deal = {
      category: 'farm_machine',
      financedAmountCents: 12_500_000,
      termMonths: 48,
    };
    const haapala: Answers = {
      q_customer_type: 'company',
      q_email: 'office@haapala.example.com',
      q_business_id: '2876543-5',
      q_company_name: 'Haapalan Tila Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'yes',
      q_farm_registry: 'FR-123456',
      q_annual_revenue: 95_000_000,
      q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
      q_pep: 'yes',
      q_pep_details: 'Municipal council member since 2021',
    };
    expect(decide({ deal, answers: haapala, highestMonthlyGrossCents: 343_000 })).toEqual({
      status: 'decided',
      outcome: 'manual_review',
      reasons: [{ rule: 'pep_manual_review' }],
      signer: { kind: 'applicant' },
    });
  });

  it('lists every reason, and a decline outranks manual review', () => {
    const deal: Deal = { category: 'laptop', financedAmountCents: 1_000_000, termMonths: 36 };
    const answers: Answers = {
      ...aino,
      q_birth_date: '2009-03-10',
      q_monthly_income: 500_000,
      q_pep: 'yes',
      q_pep_details: 'x',
    };
    const { q_usage_purpose: _usage, ...laptopAnswers } = answers;
    expect(decide({ deal, answers: laptopAnswers })).toMatchObject({
      outcome: 'declined',
      reasons: [{ rule: 'min_age' }, { rule: 'pep_manual_review' }],
    });
  });

  it('routes signing to the signatory when the applicant can’t sign for the company (card 6)', () => {
    const norvi: Answers = {
      q_customer_type: 'company',
      q_email: 'fleet@norvi.example.com',
      q_business_id: '3299871-7',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_signatory_email: 'ceo@norvi.example.com',
      q_vat_registered: 'yes',
      q_usage_purpose: 'delivery',
    };
    expect(decide({ answers: norvi })).toEqual({
      status: 'decided',
      outcome: 'approved',
      reasons: [],
      signer: { kind: 'signatory', email: 'ceo@norvi.example.com' },
    });
  });

  it('decides on the answers that still apply, ignoring stale ones', () => {
    // A leftover "other" country from when this was a consumer must not block a company.
    const company: Answers = {
      q_customer_type: 'company',
      q_email: 'it@kettukoodi.example.com',
      q_business_id: '3187650-7',
      q_company_name: 'Kettu Koodi Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'yes',
      q_usage_purpose: 'commuting',
      q_country: 'other',
    };
    expect(decide({ answers: company })).toMatchObject({ outcome: 'approved', reasons: [] });
  });
});
