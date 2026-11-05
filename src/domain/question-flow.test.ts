import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { AskWhenCondition, Question } from '@/data/schemas';
import { blockingAnswer, invalidAnswers, questionsToAsk, type Deal } from './question-flow';

// Tests run against the real data pack, so they also catch a changed question.
let questions: Question[];
beforeAll(async () => {
  ({ questions } = await loadQuestions());
});

const consumerBike: Deal = {
  customer_type: 'consumer',
  category: 'e_bike',
  financed_amount_cents: 389_000,
  term_months: 36,
};

const ids = (list: readonly Question[]) => list.map((question) => question.id);

function question(id: string, askWhen: AskWhenCondition[] = []): Question {
  return {
    id,
    type: 'text',
    text: { en: id, fi: id, sv: id, et: id },
    why_we_ask: { en: 'test' },
    ask_when: askWhen,
  };
}

describe('questionsToAsk: which questions appear', () => {
  it('asks a consumer leasing an e-bike the right questions, in data file order', () => {
    expect(ids(questionsToAsk(questions, consumerBike, {}).questions)).toEqual([
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

  it('asks for income from exactly 200 000 cents financed', () => {
    const asked = (financed: number) =>
      ids(
        questionsToAsk(questions, { ...consumerBike, financed_amount_cents: financed }, {})
          .questions
      );
    expect(asked(199_999)).not.toContain('q_monthly_income');
    expect(asked(200_000)).toContain('q_monthly_income');
  });

  it('asks about PEP status from exactly 1 000 000 cents financed', () => {
    const asked = (financed: number) =>
      ids(
        questionsToAsk(questions, { ...consumerBike, financed_amount_cents: financed }, {})
          .questions
      );
    expect(asked(999_999)).not.toContain('q_pep');
    expect(asked(1_000_000)).toContain('q_pep');
  });

  it('asks a farm company the card 7 questions', () => {
    const deal: Deal = {
      customer_type: 'company',
      category: 'farm_machine',
      financed_amount_cents: 12_500_000,
      term_months: 48,
    };
    expect(ids(questionsToAsk(questions, deal, {}).questions)).toEqual([
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

  it('adds a follow-up question only after the answer that triggers it', () => {
    const deal: Deal = { ...consumerBike, customer_type: 'company' };
    expect(ids(questionsToAsk(questions, deal, {}).questions)).not.toContain('q_signatory_email');
    expect(ids(questionsToAsk(questions, deal, { q_can_sign: 'yes' }).questions)).not.toContain(
      'q_signatory_email'
    );
    expect(ids(questionsToAsk(questions, deal, { q_can_sign: 'no' }).questions)).toContain(
      'q_signatory_email'
    );
  });

  it('never treats a missing or wrongly typed value as matching a condition', () => {
    const list: Question[] = [
      question('q_gte', [{ field: 'answers.q_x', op: 'gte', value: 1 }]),
      question('q_in', [{ field: 'answers.q_x', op: 'in', value: ['a'] }]),
    ];
    expect(questionsToAsk(list, consumerBike, {}).questions).toEqual([]);

    const withText = questionsToAsk([question('q_x'), ...list], consumerBike, { q_x: 'text' });
    expect(ids(withText.questions)).toEqual(['q_x']);

    const withNumber = questionsToAsk([question('q_x'), ...list], consumerBike, { q_x: 5 });
    expect(ids(withNumber.questions)).toEqual(['q_x', 'q_gte']);
  });

  it('supports lte, and conditions on the term', () => {
    const list = [question('q_short', [{ field: 'term_months', op: 'lte', value: 24 }])];
    const ask = (term: number) => {
      return questionsToAsk(list, { ...consumerBike, term_months: term }, {}).questions;
    };
    expect(ids(ask(24))).toEqual(['q_short']);
    expect(ids(ask(36))).toEqual([]);
  });

  it('requires every condition to hold', () => {
    const list = [
      question('q_both', [
        { field: 'customer_type', op: 'in', value: ['consumer'] },
        { field: 'category', op: 'in', value: ['laptop'] },
      ]),
    ];
    expect(questionsToAsk(list, consumerBike, {}).questions).toEqual([]);
  });
});

describe('questionsToAsk: unanswered questions', () => {
  it('lists what still needs an answer', () => {
    const flow = questionsToAsk(questions, consumerBike, {
      q_customer_type: 'consumer',
      q_email: 'aino@example.com',
    });
    expect(ids(flow.unanswered)).not.toContain('q_email');
    expect(ids(flow.unanswered)).toContain('q_full_name');
    expect(flow.questions.length - flow.unanswered.length).toBe(2);
  });

  it('counts zero as an answer', () => {
    const flow = questionsToAsk(questions, consumerBike, { q_monthly_income: 0 });
    expect(ids(flow.unanswered)).not.toContain('q_monthly_income');
  });
});

describe('questionsToAsk: changed answers', () => {
  it('drops the follow-up when the customer goes back and changes the trigger', () => {
    const deal: Deal = { ...consumerBike, customer_type: 'company' };
    const flow = questionsToAsk(questions, deal, {
      q_can_sign: 'yes',
      q_signatory_email: 'boss@example.com',
    });
    expect(flow.answers).toEqual({ q_can_sign: 'yes' });
    expect(flow.dropped).toEqual(['q_signatory_email']);
    expect(ids(flow.questions)).not.toContain('q_signatory_email');
  });

  it('drops an answer when a smaller deal makes its question unnecessary', () => {
    const flow = questionsToAsk(
      questions,
      { ...consumerBike, financed_amount_cents: 150_000 },
      { q_monthly_income: 320_000 }
    );
    expect(flow.answers).toEqual({});
    expect(flow.dropped).toEqual(['q_monthly_income']);
  });

  it('follows a chain, whatever order the questions are in', () => {
    const chain: Question[] = [
      question('q_c', [{ field: 'answers.q_b', op: 'in', value: ['yes'] }]),
      question('q_b', [{ field: 'answers.q_a', op: 'in', value: ['yes'] }]),
      question('q_a'),
    ];
    const flow = questionsToAsk(chain, consumerBike, { q_a: 'no', q_b: 'yes', q_c: 'kept?' });
    expect(flow.answers).toEqual({ q_a: 'no' });
    expect(flow.dropped).toEqual(['q_b', 'q_c']);
    expect(ids(flow.questions)).toEqual(['q_a']);
  });

  it('drops answers to questions that do not exist', () => {
    const flow = questionsToAsk(questions, consumerBike, { q_made_up: 'x' });
    expect(flow.dropped).toEqual(['q_made_up']);
  });

  it('keeps everything when nothing has changed', () => {
    const answers = { q_email: 'aino@example.com', q_usage_purpose: 'commuting' };
    const flow = questionsToAsk(questions, consumerBike, answers);
    expect(flow.answers).toEqual(answers);
    expect(flow.dropped).toEqual([]);
  });

  it('does not change the answers passed in', () => {
    const answers = { q_made_up: 'x' };
    questionsToAsk(questions, consumerBike, answers);
    expect(answers).toEqual({ q_made_up: 'x' });
  });
});

describe('invalidAnswers', () => {
  it('accepts a valid answer of every type', () => {
    expect(
      invalidAnswers(questions, {
        q_country: 'FI',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '2024-02-29',
        q_email: 'aino@example.com',
        q_monthly_income: 0,
        q_beneficial_owners: ['Jussi Haapala (60 %)'],
      })
    ).toEqual([]);
  });

  it.each([
    ['an option that does not exist', { q_country: 'DE' }, 'q_country', 'not_an_option'],
    ['a number for a choice', { q_country: 1 }, 'q_country', 'not_an_option'],
    ['blank text', { q_full_name: '   ' }, 'q_full_name', 'empty'],
    ['a badly formatted date', { q_birth_date: '12.4.1997' }, 'q_birth_date', 'not_a_date'],
    ['a day that does not exist', { q_birth_date: '2026-02-30' }, 'q_birth_date', 'not_a_date'],
    ['29 Feb outside a leap year', { q_birth_date: '2026-02-29' }, 'q_birth_date', 'not_a_date'],
    ['a bad email', { q_email: 'aino.example.com' }, 'q_email', 'not_an_email'],
    ['fractional cents', { q_monthly_income: 100.5 }, 'q_monthly_income', 'not_cents'],
    ['negative money', { q_monthly_income: -1 }, 'q_monthly_income', 'not_cents'],
    ['money as text', { q_monthly_income: '100' }, 'q_monthly_income', 'not_cents'],
    ['an empty list', { q_beneficial_owners: [] }, 'q_beneficial_owners', 'not_a_list'],
    ['a blank list item', { q_beneficial_owners: [' '] }, 'q_beneficial_owners', 'not_a_list'],
    ['text for a list', { q_beneficial_owners: 'Jussi' }, 'q_beneficial_owners', 'not_a_list'],
  ])('rejects %s', (_name, answers, questionId, reason) => {
    expect(invalidAnswers(questions, answers)).toEqual([{ question_id: questionId, reason }]);
  });

  it('reports every problem, and skips questions with no answer', () => {
    const errors = invalidAnswers(questions, { q_country: 'DE', q_email: 'nope' });
    expect(errors.map((error) => error.question_id).sort()).toEqual(['q_country', 'q_email']);
  });
});

describe('blockingAnswer', () => {
  const startOn = '2026-11-05';

  it('blocks a birth date that makes the applicant under 18 on the start date', () => {
    expect(blockingAnswer(questions, { q_birth_date: '2009-03-10' }, startOn)).toEqual({
      question_id: 'q_birth_date',
      rule: 'age_under',
      min_age: 18,
    });
  });

  it('judges age on the date it is given, so the same answer can pass later', () => {
    const answers = { q_birth_date: '2009-03-10' };
    expect(blockingAnswer(questions, answers, '2027-03-09')).not.toBeNull();
    expect(blockingAnswer(questions, answers, '2027-03-10')).toBeNull();
  });

  it('blocks a country outside the allowed list', () => {
    expect(blockingAnswer(questions, { q_country: 'other' }, startOn)).toEqual({
      question_id: 'q_country',
      rule: 'answer_in',
    });
  });

  it('lets valid answers through', () => {
    const answers = { q_birth_date: '1997-04-12', q_country: 'EE' };
    expect(blockingAnswer(questions, answers, startOn)).toBeNull();
  });

  it('returns the first block, in the order of the questions', () => {
    const answers = { q_country: 'other', q_birth_date: '2009-03-10' };
    expect(blockingAnswer(questions, answers, startOn)?.question_id).toBe('q_birth_date');
  });

  it('skips unanswered questions, and a date that is not real', () => {
    expect(blockingAnswer(questions, {}, startOn)).toBeNull();
    expect(blockingAnswer(questions, { q_birth_date: '2026-02-30' }, startOn)).toBeNull();
  });

  it('ignores a non-text answer, and questions it was not given', () => {
    expect(blockingAnswer(questions, { q_country: 5 }, startOn)).toBeNull();
    expect(blockingAnswer([], { q_country: 'other' }, startOn)).toBeNull();
  });
});
