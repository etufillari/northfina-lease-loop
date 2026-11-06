import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { QuestionsFile } from '@/data/schemas';
import { resolveQuestionFlow } from './question-flow';

let questions: QuestionsFile;

beforeAll(async () => {
  questions = await loadQuestions();
});

describe('resolveQuestionFlow', () => {
  it('asks consumer questions based on the category and financed amount', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'consumer',
      category: 'e_bike',
      financedAmountCents: 250_000,
      termMonths: 36,
      answers: {},
    });

    expect(result.applicableQuestions.map((question) => question.id)).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_monthly_income',
      'q_usage_purpose',
    ]);
  });

  it('asks company questions and the large-ticket revenue question', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'company',
      category: 'farm_machine',
      financedAmountCents: 5_000_000,
      termMonths: 48,
      answers: {},
    });

    expect(result.applicableQuestions.map((question) => question.id)).toEqual([
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
    ]);
  });

  it('removes company-only answers after changing customer type', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'consumer',
      category: 'laptop',
      financedAmountCents: 200_000,
      termMonths: 24,
      answers: {
        q_customer_type: 'consumer',
        q_business_id: '1234567-6',
        q_company_name: 'No longer relevant Oy',
      },
    });

    expect(result.answers).toEqual({ q_customer_type: 'consumer' });
    expect(result.removedAnswerIds).toEqual(['q_business_id', 'q_company_name']);
  });

  it('removes a dependent question answer when its earlier answer changes', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'company',
      category: 'laptop',
      financedAmountCents: 200_000,
      termMonths: 24,
      answers: {
        q_customer_type: 'company',
        q_can_sign: 'no',
        q_signatory_email: 'signer@example.com',
      },
    });

    expect(result.answers).toMatchObject({
      q_customer_type: 'company',
      q_can_sign: 'no',
      q_signatory_email: 'signer@example.com',
    });

    const changed = resolveQuestionFlow(questions, {
      customerType: 'company',
      category: 'laptop',
      financedAmountCents: 200_000,
      termMonths: 24,
      answers: {
        q_customer_type: 'company',
        q_can_sign: 'yes',
        q_signatory_email: 'signer@example.com',
      },
    });

    expect(changed.answers).not.toHaveProperty('q_signatory_email');
    expect(changed.removedAnswerIds).toContain('q_signatory_email');
  });

  it('reports an underage applicant as blocked on the contract start date', () => {
    const result = resolveQuestionFlow(
      questions,
      {
        customerType: 'consumer',
        category: 'laptop',
        financedAmountCents: 200_000,
        termMonths: 36,
        answers: { q_birth_date: '2008-11-06' },
      },
      '2026-11-05'
    );

    expect(result.blockingReasons).toEqual([
      {
        questionId: 'q_birth_date',
        rule: 'age_under',
        message: 'Applicant must be at least 18 years old on the contract start date.',
      },
    ]);
  });

  it('reports a blocked country answer', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'consumer',
      category: 'laptop',
      financedAmountCents: 200_000,
      termMonths: 36,
      answers: { q_country: 'other' },
    });

    expect(result.blockingReasons).toMatchObject([{ questionId: 'q_country', rule: 'answer_in' }]);
  });

  it('reports an invalid Finnish business ID', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'company',
      answers: { q_business_id: '1234567-8' },
    });

    expect(result.blockingReasons).toEqual([
      {
        questionId: 'q_business_id',
        rule: 'invalid_business_id',
        message: 'Enter a valid Finnish business ID.',
      },
    ]);
  });

  it('accepts the valid business ID example from the question data', () => {
    const result = resolveQuestionFlow(questions, {
      customerType: 'company',
      answers: { q_business_id: '0112038-9' },
    });

    expect(result.blockingReasons).toEqual([]);
  });
});
