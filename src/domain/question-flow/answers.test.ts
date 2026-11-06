import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import {
  answerProblem,
  answersFromCustomer,
  birthDateRange,
  eligibilityInputFromAnswers,
  grossFromNetCents,
  centsToEuroInput,
  parseEurosToCents,
  validateAnswer,
} from './answers';
import { isComplete, pruneAnswers, type FlowContext } from './engine';

let bank: Question[];
let customers: Customer[];
beforeAll(async () => {
  bank = (await loadQuestions()).questions;
  customers = await loadCustomers();
});

describe('parseEurosToCents', () => {
  it('reads whole euros and both decimal marks without floats', () => {
    expect(parseEurosToCents('3200')).toBe(320_000);
    expect(parseEurosToCents('3 200,50')).toBe(320_050);
    expect(parseEurosToCents('3200.5')).toBe(320_050);
    expect(parseEurosToCents('0,07')).toBe(7);
    expect(parseEurosToCents('1999.99 €')).toBe(199_999);
  });

  it('is null for anything that is not an amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1,2,3', '.5']) {
      expect(parseEurosToCents(bad)).toBeNull();
    }
  });
});

describe('centsToEuroInput (review finding 14)', () => {
  it("writes cents to edit with the page's decimal mark, and parseEurosToCents reads it back", () => {
    expect(centsToEuroInput(320_050, '.')).toBe('3200.50');
    expect(centsToEuroInput(320_050, ',')).toBe('3200,50');
    expect(centsToEuroInput(320_000, '.')).toBe('3200');
    expect(centsToEuroInput(7, ',')).toBe('0,07');
    for (const cents of [0, 7, 99, 100, 320_050, 1_000_001]) {
      expect(parseEurosToCents(centsToEuroInput(cents, '.'))).toBe(cents);
      expect(parseEurosToCents(centsToEuroInput(cents, ','))).toBe(cents);
    }
  });

  it('throws on cents that are not a whole number at least 0', () => {
    expect(() => centsToEuroInput(-1, '.')).toThrow();
    expect(() => centsToEuroInput(1.5, '.')).toThrow();
  });
});

describe('grossFromNetCents', () => {
  it('card 1: 10 730 net at 25.5 % is 13 466 gross (VAT 2 736, half up)', () => {
    expect(grossFromNetCents(10_730, 2_550)).toBe(13_466);
  });

  it('rounds exactly half a cent up', () => {
    // 2 × 2 500 bp = 0.5 cent of VAT → 1
    expect(grossFromNetCents(2, 2_500)).toBe(3);
    expect(grossFromNetCents(0, 2_550)).toBe(0);
  });
});

describe('eligibilityInputFromAnswers', () => {
  const context: FlowContext = {
    customerType: 'company',
    category: 'e_bike',
    financedCents: 549_000,
    termMonths: 36,
  };

  it('reads the answers that matter and ignores blanks', () => {
    const input = eligibilityInputFromAnswers({
      context,
      answers: {
        q_customer_type: 'company',
        q_business_id: ' 3299871-7 ',
        q_can_sign: 'no',
        q_signatory_email: 'ceo@norvi.example.com',
        q_pep: 'no',
        q_country: '',
      },
      startDate: '2026-11-05',
      grossMonthlyRentCents: 19_006,
    });
    expect(input).toMatchObject({
      customerType: 'company',
      businessId: '3299871-7',
      applicantCanSign: false,
      signatoryEmail: 'ceo@norvi.example.com',
      isPep: false,
      country: undefined,
      financedCents: 549_000,
    });
  });

  it('money answers are cents as digits; no PEP without a PEP answer', () => {
    const input = eligibilityInputFromAnswers({
      context: { ...context, customerType: 'consumer' },
      answers: { q_monthly_income: '320000' },
      startDate: '2026-11-05',
      grossMonthlyRentCents: 1,
    });
    expect(input.monthlyNetIncomeCents).toBe(320_000);
    expect(input.customerType).toBe('consumer');
    expect(input.isPep).toBe(false);
    expect(input.applicantCanSign).toBeUndefined();
  });

  it('D82: a PEP is a PEP only by the answer, which is asked from 10 000 € financed', () => {
    const input = (answers: Record<string, string>) =>
      eligibilityInputFromAnswers({
        context,
        answers,
        startDate: '2026-11-05',
        grossMonthlyRentCents: 1,
      });
    expect(input({ q_pep: 'yes' }).isPep).toBe(true);
    expect(input({ q_pep: 'no' }).isPep).toBe(false);
    // The question was hidden (a small lease): no answer, no PEP check.
    expect(input({}).isPep).toBe(false);
  });
});

describe('eligibilityInputFromAnswers: the record country (review finding 12)', () => {
  const company: FlowContext = {
    customerType: 'company',
    category: 'e_bike',
    financedCents: 549_000,
    termMonths: 36,
  };
  const base = { context: company, startDate: '2026-11-05', grossMonthlyRentCents: 19_006 };

  it('a company is not asked its country: the record country is checked (DE is out)', () => {
    const input = eligibilityInputFromAnswers({ ...base, answers: {}, recordCountry: 'DE' });
    expect(input.country).toBe('DE');
  });

  it('an answered country wins over the record', () => {
    const input = eligibilityInputFromAnswers({
      ...base,
      answers: { q_country: 'FI' },
      recordCountry: 'DE',
    });
    expect(input.country).toBe('FI');
  });
});

describe('answersFromCustomer', () => {
  it('fills every visible question for every persona, at every amount', () => {
    for (const c of customers) {
      for (const financedCents of [30_000, 389_000, 1_290_000, 12_500_000]) {
        for (const category of ['e_bike', 'laptop', 'farm_machine']) {
          const ctx = { customerType: c.type, category, financedCents, termMonths: 36 };
          const answers = pruneAnswers(bank, ctx, answersFromCustomer(c));
          expect(isComplete(bank, ctx, answers)).toBe(true);
        }
      }
    }
  });
});

describe('validateAnswer', () => {
  const q = (id: string) => bank.find((x) => x.id === id)!;

  it('choice answers must be one of the options', () => {
    expect(validateAnswer(q('q_can_sign'), 'no')).toBe(true);
    expect(validateAnswer(q('q_can_sign'), 'maybe')).toBe(false);
  });

  it('dates must be real ISO days', () => {
    expect(validateAnswer(q('q_birth_date'), '2008-02-29')).toBe(true);
    expect(validateAnswer(q('q_birth_date'), '2009-02-29')).toBe(false);
    expect(validateAnswer(q('q_birth_date'), '10.3.2009')).toBe(false);
  });

  it('money is cents as digits, e-mail needs an @ and a dot, lists need an item', () => {
    expect(validateAnswer(q('q_monthly_income'), '320000')).toBe(true);
    expect(validateAnswer(q('q_monthly_income'), '3200.00')).toBe(false);
    expect(validateAnswer(q('q_email'), 'a@example.com')).toBe(true);
    expect(validateAnswer(q('q_email'), 'a@b')).toBe(false);
    expect(validateAnswer(q('q_beneficial_owners'), ['Jussi Haapala (60 %)'])).toBe(true);
    expect(validateAnswer(q('q_beneficial_owners'), [])).toBe(false);
    expect(validateAnswer(q('q_beneficial_owners'), 'Jussi')).toBe(false);
  });

  it('a wrong business id check digit is still a valid answer (eligibility rejects it)', () => {
    expect(validateAnswer(q('q_business_id'), '1234567-8')).toBe(true);
    expect(validateAnswer(q('q_business_id'), '   ')).toBe(false);
  });

  it('every persona answer passes validation', () => {
    for (const c of customers) {
      for (const [id, answer] of Object.entries(answersFromCustomer(c))) {
        expect(validateAnswer(q(id), answer), `${c.id} ${id}`).toBe(true);
      }
    }
  });
});

describe('birthDateRange (D37)', () => {
  it('runs from 120 years before today to today', () => {
    expect(birthDateRange('2026-11-05')).toEqual({ earliest: '1906-11-05', latest: '2026-11-05' });
  });

  it('on 29 February the earliest day is 28 February of a common year', () => {
    // 1900 is not a leap year (divisible by 100, not by 400)
    expect(birthDateRange('2020-02-29')).toEqual({ earliest: '1900-02-28', latest: '2020-02-29' });
    expect(birthDateRange('2024-02-29').earliest).toBe('1904-02-29');
  });
});

describe('answerProblem', () => {
  const q = (id: string) => bank.find((x) => x.id === id)!;
  const today = '2026-11-05';

  it('the trap: a birth date in the future is not an answer, nor is one before 1906-11-05', () => {
    const range = { code: 'birth_date_out_of_range', params: birthDateRange(today) };
    expect(answerProblem(q('q_birth_date'), '2030-01-01', { today })).toEqual(range);
    expect(answerProblem(q('q_birth_date'), '2026-11-06', { today })).toEqual(range);
    expect(answerProblem(q('q_birth_date'), '1800-01-01', { today })).toEqual(range);
    expect(answerProblem(q('q_birth_date'), '1906-11-04', { today })).toEqual(range);
  });

  it('both ends of the range are answers; card 5 Mikko (2009-03-10) is one', () => {
    expect(answerProblem(q('q_birth_date'), '2026-11-05', { today })).toBeNull();
    expect(answerProblem(q('q_birth_date'), '1906-11-05', { today })).toBeNull();
    expect(answerProblem(q('q_birth_date'), '2009-03-10', { today })).toBeNull();
  });

  it('a wrong shape is invalid before the range is looked at', () => {
    expect(answerProblem(q('q_birth_date'), '2009-02-29', { today })).toEqual({
      code: 'invalid',
      params: {},
    });
    expect(answerProblem(q('q_can_sign'), 'maybe', { today })).toEqual({
      code: 'invalid',
      params: {},
    });
  });

  it('card 6: the signatory cannot be the applicant, whatever the case or spaces', () => {
    const answers = { q_email: 'fleet@norvi.example.com' };
    const signatory = q('q_signatory_email');
    expect(answerProblem(signatory, ' Fleet@Norvi.example.com ', { today, answers })).toEqual({
      code: 'signatory_is_applicant',
      params: {},
    });
    expect(answerProblem(signatory, 'signatory@norvi.example.com', { today, answers })).toBeNull();
    expect(answerProblem(signatory, 'signatory@norvi.example.com', { today })).toBeNull();
  });

  it('the trap: nor the applicant’s record e-mail, whatever e-mail they answered', () => {
    const signatory = q('q_signatory_email');
    const flow = {
      today,
      answers: { q_email: 'coordinator.private@example.net' },
      applicantEmail: 'fleet@norvi.example.com',
    };
    expect(answerProblem(signatory, 'FLEET@norvi.example.com ', flow)).toEqual({
      code: 'signatory_is_applicant',
      params: {},
    });
    expect(answerProblem(signatory, 'coordinator.private@example.net', flow)).toEqual({
      code: 'signatory_is_applicant',
      params: {},
    });
    expect(answerProblem(signatory, 'ceo@norvi.example.com', flow)).toBeNull();
  });

  it('every persona answer has no problem on the demo day', () => {
    for (const c of customers) {
      const answers = answersFromCustomer(c);
      for (const [id, answer] of Object.entries(answers)) {
        expect(answerProblem(q(id), answer, { today, answers }), `${c.id} ${id}`).toBeNull();
      }
    }
  });
});
