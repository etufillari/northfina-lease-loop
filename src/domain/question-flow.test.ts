import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { QuestionsFile } from '@/data/schemas';
import { evaluateApplication, questionFlowFor, type ApplicationAnswers } from './question-flow';

let questions: QuestionsFile;

beforeAll(async () => {
  questions = await loadQuestions();
});

const consumerAnswers: ApplicationAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

const consumerDeal = {
  category: 'e_bike' as const,
  financedAmountCents: 389_000,
  termMonths: 36,
};

describe('questionFlowFor', () => {
  it('starts with only questions that do not need earlier answers', () => {
    const result = questionFlowFor(questions, consumerDeal, {});

    expect(result.activeQuestions.map((question) => question.id)).toEqual([
      'q_customer_type',
      'q_email',
      'q_usage_purpose',
    ]);
    expect(result.nextQuestionId).toBe('q_customer_type');
  });

  it('asks consumer questions and keeps their answers', () => {
    const result = questionFlowFor(questions, consumerDeal, consumerAnswers);

    expect(result.activeQuestions.map((question) => question.id)).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_monthly_income',
      'q_usage_purpose',
    ]);
    expect(result.missingQuestionIds).toEqual([]);
    expect(result.retainedAnswers).toEqual(consumerAnswers);
  });

  it('removes answers that stop applying after an earlier answer changes', () => {
    const result = questionFlowFor(questions, consumerDeal, {
      ...consumerAnswers,
      q_customer_type: 'company',
      q_business_id: '3012456-5',
      q_company_name: 'Example Oy',
      q_can_sign: 'yes',
      q_vat_registered: 'yes',
    });

    expect(result.discardedAnswerIds).toEqual([
      'q_full_name',
      'q_birth_date',
      'q_country',
      'q_employment',
      'q_monthly_income',
    ]);
    expect(result.retainedAnswers).not.toHaveProperty('q_birth_date');
    expect(result.retainedAnswers).toMatchObject({
      q_customer_type: 'company',
      q_business_id: '3012456-5',
    });
  });

  it('requires all currently applicable questions before evaluation', () => {
    const result = evaluateApplication(questions, {
      ...consumerDeal,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 13_466,
      answers: { q_customer_type: 'consumer' },
    });

    expect(result.decision).toBe('incomplete');
    expect(result.questionFlow.nextQuestionId).toBe('q_full_name');
  });
});

describe('evaluateApplication', () => {
  it('approves a complete affordable consumer application', () => {
    const result = evaluateApplication(questions, {
      ...consumerDeal,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 13_466,
      answers: consumerAnswers,
    });

    expect(result).toMatchObject({ decision: 'approved', reasons: [] });
  });

  it('rejects an applicant who is under 18 on the start date', () => {
    const result = evaluateApplication(questions, {
      ...consumerDeal,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 13_466,
      answers: { ...consumerAnswers, q_birth_date: '2009-03-10' },
    });

    expect(result).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'age_under_minimum', questionId: 'q_birth_date' }],
    });
  });

  it('rejects unsupported residency and unaffordable rent', () => {
    const result = evaluateApplication(questions, {
      ...consumerDeal,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 13_466,
      answers: { ...consumerAnswers, q_country: 'other', q_monthly_income: 40_000 },
    });

    expect(result.decision).toBe('rejected');
    expect(result.reasons).toEqual([
      { code: 'unsupported_residency', questionId: 'q_country' },
      { code: 'unaffordable', questionId: 'q_monthly_income' },
    ]);
  });

  it('rejects an invalid business ID and unauthorized company signatory', () => {
    const result = evaluateApplication(questions, {
      category: 'laptop',
      financedAmountCents: 250_000,
      termMonths: 24,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 10_000,
      answers: {
        q_customer_type: 'company',
        q_email: 'fleet@example.com',
        q_business_id: '1234567-8',
        q_company_name: 'Typo Trading Oy',
        q_can_sign: 'no',
        q_signatory_email: 'signer@example.com',
        q_vat_registered: 'yes',
      },
    });

    expect(result).toMatchObject({
      decision: 'rejected',
      reasons: [
        { code: 'invalid_business_id', questionId: 'q_business_id' },
        { code: 'not_authorized_signatory', questionId: 'q_can_sign' },
      ],
    });
  });

  it('sends a politically exposed applicant to manual review', () => {
    const result = evaluateApplication(questions, {
      category: 'farm_machine',
      financedAmountCents: 12_500_000,
      termMonths: 48,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 300_000,
      answers: {
        q_customer_type: 'company',
        q_email: 'office@example.com',
        q_business_id: '2876543-5',
        q_company_name: 'Haapalan Tila Oy',
        q_can_sign: 'yes',
        q_vat_registered: 'yes',
        q_farm_registry: 'FI-123',
        q_annual_revenue: 9_500_000,
        q_beneficial_owners: ['Jussi Haapala', 'Maria Haapala'],
        q_pep: 'yes',
        q_pep_details: 'Municipal office since 2020',
      },
    });

    expect(result).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'pep_manual_review', questionId: 'q_pep' }],
    });
  });

  it('calculates age at the start date boundary', () => {
    const result = evaluateApplication(questions, {
      ...consumerDeal,
      startDate: '2026-11-05',
      monthlyGrossRentCents: 13_466,
      answers: { ...consumerAnswers, q_birth_date: '2008-11-05' },
    });

    expect(result.decision).toBe('approved');
  });
});
