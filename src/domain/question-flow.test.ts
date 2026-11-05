import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { Question } from '@/data/schemas';
import {
  askedQuestions,
  nextQuestion,
  relevantAnswers,
  validateAnswer,
  type Answers,
  type Deal,
} from './question-flow';

let questions: Question[];
beforeAll(async () => {
  questions = (await loadQuestions()).questions;
});

const ebike: Deal = { category: 'e_bike', financedAmountCents: 389_000, termMonths: 36 };
// ebike-001 at 1 899 €: under the 2 000 € income threshold.
const cheapEbike: Deal = { ...ebike, financedAmountCents: 189_900 };
const ids = (deal: Deal, answers: Answers) =>
  askedQuestions(questions, deal, answers).map((q) => q.id);
const byId = (id: string) => {
  const question = questions.find((q) => q.id === id);
  if (!question) throw new Error(`no question ${id}`);
  return question;
};

describe('askedQuestions', () => {
  it('starts with the questions that always apply, plus the ones the deal triggers', () => {
    // Nothing answered yet: customer type, email (always), usage purpose (any e-bike).
    expect(ids(ebike, {})).toEqual(['q_customer_type', 'q_email', 'q_usage_purpose']);
  });

  it('asks a consumer leasing a cheap e-bike only what applies to them', () => {
    expect(ids(cheapEbike, { q_customer_type: 'consumer' })).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_usage_purpose',
    ]);
  });

  it('asks for income from exactly 2 000 € financed (gte is inclusive)', () => {
    const consumer = { q_customer_type: 'consumer' };
    expect(ids({ ...ebike, financedAmountCents: 199_999 }, consumer)).not.toContain(
      'q_monthly_income'
    );
    expect(ids({ ...ebike, financedAmountCents: 200_000 }, consumer)).toContain('q_monthly_income');
  });

  it('asks for the signatory’s email only when the applicant cannot sign (card 6)', () => {
    const company = { q_customer_type: 'company' };
    expect(ids(ebike, { ...company, q_can_sign: 'no' })).toContain('q_signatory_email');
    expect(ids(ebike, { ...company, q_can_sign: 'yes' })).not.toContain('q_signatory_email');
  });

  it('asks the anti-money-laundering questions only for big deals', () => {
    const company = { q_customer_type: 'company', q_pep: 'yes' };
    const big: Deal = { category: 'farm_machine', financedAmountCents: 12_500_000, termMonths: 48 };
    expect(ids(big, company)).toEqual(
      expect.arrayContaining([
        'q_annual_revenue',
        'q_beneficial_owners',
        'q_pep',
        'q_pep_details',
        'q_farm_registry',
      ])
    );
    const small: Deal = { ...big, financedAmountCents: 999_999 };
    expect(ids(small, company)).not.toContain('q_pep');
    expect(ids(small, company)).not.toContain('q_pep_details');
  });

  it('ignores a stale answer: a pep "yes" from a bigger deal can’t trigger the details question', () => {
    // q_pep isn't asked under 10 000 €, so its old answer must not switch on q_pep_details.
    expect(ids({ ...ebike, financedAmountCents: 500_000 }, { q_pep: 'yes' })).not.toContain(
      'q_pep_details'
    );
  });
});

describe('relevantAnswers', () => {
  it('drops answers that stop applying when the customer type changes', () => {
    const answers: Answers = {
      q_customer_type: 'consumer',
      q_email: 'company@example.com',
      q_business_id: '3299871-7',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_signatory_email: 'boss@example.com',
    };
    // Switched from company to consumer: the company answers go, the email stays.
    expect(relevantAnswers(questions, ebike, answers)).toEqual({
      answers: { q_customer_type: 'consumer', q_email: 'company@example.com' },
      dropped: ['q_business_id', 'q_company_name', 'q_can_sign', 'q_signatory_email'],
    });
  });

  it('drops the signatory email when "can you sign?" changes to yes', () => {
    const answers = {
      q_customer_type: 'company',
      q_can_sign: 'yes',
      q_signatory_email: 'x@example.com',
    };
    expect(relevantAnswers(questions, ebike, answers).dropped).toEqual(['q_signatory_email']);
  });

  it('drops the pep answers when a slider brings the deal under 10 000 €', () => {
    const answers = { q_customer_type: 'consumer', q_pep: 'no' };
    const deal: Deal = { category: 'laptop', financedAmountCents: 1_000_000, termMonths: 24 };
    expect(relevantAnswers(questions, deal, answers).dropped).toEqual([]);
    expect(
      relevantAnswers(questions, { ...deal, financedAmountCents: 999_999 }, answers).dropped
    ).toEqual(['q_pep']);
  });

  it('drops answers to questions the bank doesn’t have', () => {
    expect(relevantAnswers(questions, ebike, { q_made_up: 'x' }).dropped).toEqual(['q_made_up']);
  });
});

describe('nextQuestion', () => {
  it('returns the first applicable question without an answer, then null when done', () => {
    expect(nextQuestion(questions, ebike, {})?.id).toBe('q_customer_type');
    expect(nextQuestion(questions, ebike, { q_customer_type: 'consumer' })?.id).toBe('q_full_name');
    const done: Answers = {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_usage_purpose: 'commuting',
    };
    expect(nextQuestion(questions, cheapEbike, done)).toBeNull();
    // The same answers on a 3 890 € e-bike still need the income question.
    expect(nextQuestion(questions, ebike, done)?.id).toBe('q_monthly_income');
  });
});

describe('validateAnswer', () => {
  it('accepts only the listed options for a choice', () => {
    expect(validateAnswer(byId('q_country'), 'FI')).toEqual({ ok: true, value: 'FI' });
    expect(validateAnswer(byId('q_country'), 'NO')).toEqual({ ok: false, reason: 'not_an_option' });
  });

  it('trims text and refuses an empty answer', () => {
    expect(validateAnswer(byId('q_full_name'), '  Aino  ')).toEqual({ ok: true, value: 'Aino' });
    expect(validateAnswer(byId('q_full_name'), '   ')).toEqual({ ok: false, reason: 'required' });
  });

  it('checks dates, emails, whole-cent money and lists', () => {
    expect(validateAnswer(byId('q_birth_date'), '2009-02-30')).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
    expect(validateAnswer(byId('q_email'), 'aino@')).toEqual({
      ok: false,
      reason: 'invalid_email',
    });
    expect(validateAnswer(byId('q_monthly_income'), 320_000)).toEqual({ ok: true, value: 320_000 });
    expect(validateAnswer(byId('q_monthly_income'), 10.5)).toEqual({
      ok: false,
      reason: 'invalid_money',
    });
    expect(validateAnswer(byId('q_beneficial_owners'), ['Jussi Haapala (60 %)'])).toMatchObject({
      ok: true,
    });
    expect(validateAnswer(byId('q_beneficial_owners'), [])).toEqual({
      ok: false,
      reason: 'required',
    });
  });

  it('checks the business ID check digit (Typo Trading’s 1234567-8 fails)', () => {
    expect(validateAnswer(byId('q_business_id'), '3299871-7')).toMatchObject({ ok: true });
    expect(validateAnswer(byId('q_business_id'), '1234567-8')).toEqual({
      ok: false,
      reason: 'invalid_business_id',
    });
  });
});

describe('the question bank', () => {
  it('only refers to answers of questions that come earlier, so one pass is enough', () => {
    questions.forEach((question, index) => {
      const earlier = new Set(questions.slice(0, index).map((q) => q.id));
      for (const condition of question.ask_when) {
        if (condition.field.startsWith('answers.')) {
          expect(earlier.has(condition.field.slice('answers.'.length))).toBe(true);
        }
      }
    });
  });
});
