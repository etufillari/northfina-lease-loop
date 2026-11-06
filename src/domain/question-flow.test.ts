import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { Question } from '@/data/schemas';
import type { Answers, DealContext } from './question-flow';
import { firstBlockedAnswer, nextQuestion, pruneAnswers, visibleQuestions } from './question-flow';

let questions: Question[];
beforeAll(async () => {
  questions = (await loadQuestions()).questions;
});

const ids = (deal: DealContext, answers: Answers) =>
  visibleQuestions(questions, deal, answers).map((q) => q.id);

describe('visibleQuestions', () => {
  it('starts every flow with the customer type and email only', () => {
    const deal: DealContext = { category: 'e_bike', financedAmountCents: 150_000, termMonths: 24 };
    expect(ids(deal, {})).toEqual(['q_customer_type', 'q_email', 'q_usage_purpose']);
  });

  it('asks consumers for income only from €2,000 financed', () => {
    const small: DealContext = { category: 'laptop', financedAmountCents: 199_999, termMonths: 24 };
    const large: DealContext = { category: 'laptop', financedAmountCents: 200_000, termMonths: 24 };
    const answers: Answers = { q_customer_type: 'consumer' };
    expect(ids(small, answers)).not.toContain('q_monthly_income');
    expect(ids(large, answers)).toContain('q_monthly_income');
  });

  it('scenario card 6: Norvi, 4 × ebike-004, applicant cannot sign', () => {
    // 4 bikes make the financed total cross the €10,000 PEP threshold.
    const deal: DealContext = {
      category: 'e_bike',
      financedAmountCents: 2_200_000,
      termMonths: 24,
    };
    const answers: Answers = { q_customer_type: 'company' };
    const visible = ids(deal, answers);
    expect(visible).toEqual(
      expect.arrayContaining([
        'q_business_id',
        'q_company_name',
        'q_can_sign',
        'q_vat_registered',
        'q_usage_purpose',
        'q_pep',
      ])
    );
    // Not for companies, and not under €50,000 financed:
    expect(visible).not.toContain('q_birth_date');
    expect(visible).not.toContain('q_annual_revenue');
    expect(visible).not.toContain('q_beneficial_owners');
    // The signatory email appears only once the applicant says they cannot sign.
    expect(visible).not.toContain('q_signatory_email');
    expect(ids(deal, { ...answers, q_can_sign: 'no' })).toContain('q_signatory_email');
  });

  it('scenario card 7: Haapala, farm-002, €125,000 financed brings in the big-ticket questions', () => {
    const deal: DealContext = {
      category: 'farm_machine',
      financedAmountCents: 12_500_000,
      termMonths: 48,
    };
    const answers: Answers = { q_customer_type: 'company' };
    const visible = ids(deal, answers);
    expect(visible).toEqual(
      expect.arrayContaining([
        'q_farm_registry',
        'q_annual_revenue',
        'q_beneficial_owners',
        'q_pep',
      ])
    );
    expect(visible).not.toContain('q_pep_details');
    expect(ids(deal, { ...answers, q_pep: 'yes' })).toContain('q_pep_details');
  });
});

describe('nextQuestion', () => {
  it('walks the visible questions in file order, one at a time', () => {
    const deal: DealContext = { category: 'laptop', financedAmountCents: 150_000, termMonths: 24 };
    expect(nextQuestion(questions, deal, {})?.id).toBe('q_customer_type');
    expect(nextQuestion(questions, deal, { q_customer_type: 'consumer' })?.id).toBe('q_full_name');
  });

  it('is null when everything that applies is answered', () => {
    const deal: DealContext = { category: 'laptop', financedAmountCents: 150_000, termMonths: 24 };
    const answers: Answers = {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino@example.com',
      q_country: 'FI',
      q_employment: 'employed',
    };
    expect(nextQuestion(questions, deal, answers)).toBeNull();
  });
});

describe('pruneAnswers', () => {
  it('drops the signatory email when q_can_sign changes back to yes', () => {
    const deal: DealContext = {
      category: 'e_bike',
      financedAmountCents: 2_200_000,
      termMonths: 24,
    };
    const answers: Answers = {
      q_customer_type: 'company',
      q_can_sign: 'yes', // changed from "no"
      q_signatory_email: 'ceo@norvi.fi',
    };
    expect(pruneAnswers(questions, deal, answers)).toEqual({
      q_customer_type: 'company',
      q_can_sign: 'yes',
    });
  });

  it('drops threshold questions when the deal shrinks below them', () => {
    const deal: DealContext = { category: 'e_bike', financedAmountCents: 900_000, termMonths: 24 };
    const answers: Answers = {
      q_customer_type: 'company',
      q_pep: 'yes',
      q_pep_details: 'City council member',
    };
    expect(pruneAnswers(questions, deal, answers)).toEqual({ q_customer_type: 'company' });
  });

  it('cascades: switching customer type drops the whole consumer branch', () => {
    const deal: DealContext = { category: 'laptop', financedAmountCents: 300_000, termMonths: 24 };
    const answers: Answers = {
      q_customer_type: 'company', // changed from "consumer"
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: 320_000,
    };
    expect(pruneAnswers(questions, deal, answers)).toEqual({ q_customer_type: 'company' });
  });
});

describe('firstBlockedAnswer', () => {
  const deal: DealContext = { category: 'laptop', financedAmountCents: 150_000, termMonths: 24 };

  it('scenario card 5: Mikko is 17 on the start date, with a kind come-back date', () => {
    const answers: Answers = { q_customer_type: 'consumer', q_birth_date: '2009-03-10' };
    expect(firstBlockedAnswer(questions, deal, answers, '2026-11-20')).toEqual({
      questionId: 'q_birth_date',
      rule: 'age_under',
      eligibleFrom: '2027-03-10',
    });
  });

  it('does not block Mikko once he is 18 on the start date', () => {
    const answers: Answers = { q_customer_type: 'consumer', q_birth_date: '2009-03-10' };
    expect(firstBlockedAnswer(questions, deal, answers, '2027-03-10')).toBeNull();
  });

  it('blocks a country outside FI/SE/EE', () => {
    const answers: Answers = {
      q_customer_type: 'consumer',
      q_birth_date: '1997-04-12',
      q_country: 'other',
    };
    expect(firstBlockedAnswer(questions, deal, answers, '2026-11-20')).toEqual({
      questionId: 'q_country',
      rule: 'answer_in',
    });
  });

  it('does not block Lena from Estonia', () => {
    const answers: Answers = {
      q_customer_type: 'consumer',
      q_birth_date: '1997-04-12',
      q_country: 'EE',
    };
    expect(firstBlockedAnswer(questions, deal, answers, '2026-11-20')).toBeNull();
  });
});
