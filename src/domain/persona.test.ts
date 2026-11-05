import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import { answersFromCustomer, answersNotMatchingCustomer } from './persona';
import type { Answers, Deal } from './question-flow';

let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});
const persona = (id: string) => {
  const customer = customers.find((c) => c.id === id);
  if (!customer) throw new Error(id);
  return customer;
};

describe('answersFromCustomer', () => {
  it('fills a consumer’s answers, income in cents', () => {
    expect(answersFromCustomer(persona('cust-aino'))).toEqual({
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: 320_000,
      q_pep: 'no',
    });
  });

  it('fills a company’s answers, including whether the applicant can sign', () => {
    expect(answersFromCustomer(persona('cust-norvi'))).toEqual({
      q_customer_type: 'company',
      q_email: 'fleet@norvi.example.com',
      q_business_id: '3299871-7',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_vat_registered: 'yes',
      q_annual_revenue: 410_000_000,
      q_pep: 'no',
    });
  });

  it('fills a sole trader and copies beneficial owners when the record has them', () => {
    expect(answersFromCustomer(persona('cust-pekka'))).toMatchObject({
      q_customer_type: 'sole_trader',
      q_full_name: 'Pekka Korhonen',
      q_business_id: '3012456-5',
      q_vat_registered: 'yes',
    });
    expect(answersFromCustomer(persona('cust-haapala'))).toMatchObject({
      q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
      q_pep: 'yes',
    });
  });

  it('answers "other" for a country outside Finland, Sweden and Estonia', () => {
    expect(answersFromCustomer({ ...persona('cust-lena'), country: 'NO' })).toMatchObject({
      q_country: 'other',
    });
    expect(answersFromCustomer(persona('cust-lena'))).toMatchObject({ q_country: 'EE' });
  });
});

describe('answersNotMatchingCustomer', () => {
  let questions: Question[];
  beforeAll(async () => {
    questions = (await loadQuestions()).questions;
  });
  // Under 2 000 € financed: income is not asked yet.
  const small: Deal = { category: 'e_bike', financedAmountCents: 150_000, termMonths: 36 };
  // ebike-003 at 389 000: income is asked (from 200 000), PEP is not (from 1 000 000).
  const ebike: Deal = { category: 'e_bike', financedAmountCents: 389_000, termMonths: 36 };
  // Card 7 size: every company question applies, PEP and beneficial owners included.
  const tractor: Deal = {
    category: 'farm_machine',
    financedAmountCents: 12_500_000,
    termMonths: 60,
  };
  const check = (id: string, deal: Deal, answers: Answers) =>
    answersNotMatchingCustomer(questions, deal, persona(id), answers);
  const own = (id: string) => answersFromCustomer(persona(id));

  it('finds nothing when the answers are the customer’s own, plus free choices', () => {
    expect(check('cust-aino', ebike, { ...own('cust-aino'), q_usage_purpose: 'leisure' })).toEqual(
      []
    );
    const haapala = {
      ...own('cust-haapala'),
      q_pep_details: 'Municipal council member',
      q_farm_registry: 'FI-123',
    };
    expect(check('cust-haapala', tractor, haapala)).toEqual([]);
  });

  it('refuses Mikko with a changed birth date (card 5: born 2009-03-10)', () => {
    const answers = { ...own('cust-mikko'), q_birth_date: '1990-03-10' };
    expect(check('cust-mikko', ebike, answers)).toEqual(['q_birth_date']);
  });

  it('refuses Norvi saying the applicant can sign (card 6: applicant_can_sign false)', () => {
    const answers = { ...own('cust-norvi'), q_can_sign: 'yes' };
    expect(check('cust-norvi', tractor, answers)).toEqual(['q_can_sign']);
  });

  it('lists every mismatch in the question bank’s order', () => {
    const answers = {
      ...own('cust-aino'),
      q_monthly_income: 900_000,
      q_full_name: 'Someone Else',
      q_email: 'other@example.com',
    };
    expect(check('cust-aino', ebike, answers)).toEqual([
      'q_full_name',
      'q_email',
      'q_monthly_income',
    ]);
  });

  it('refuses a company persona answering as a consumer', () => {
    const answers = {
      q_customer_type: 'consumer',
      q_full_name: 'Norvi Logistics Oy',
      q_birth_date: '1990-01-01',
      q_email: 'fleet@norvi.example.com',
    };
    expect(check('cust-norvi', ebike, answers)).toEqual(['q_customer_type']);
  });

  it('ignores answers to questions that no longer apply (D-022)', () => {
    // Income is only asked from 200 000 financed; the record says 320 000.
    const answers = { ...own('cust-aino'), q_monthly_income: 1 };
    expect(check('cust-aino', small, answers)).toEqual([]);
    expect(check('cust-aino', ebike, answers)).toEqual(['q_monthly_income']);
  });

  it('leaves missing answers to the application, which stays incomplete', () => {
    expect(check('cust-mikko', ebike, { q_customer_type: 'consumer' })).toEqual([]);
    expect(check('cust-mikko', ebike, {})).toEqual([]);
  });

  it('ignores spacing and email case; compares lists item by item', () => {
    const answers = {
      ...own('cust-aino'),
      q_full_name: '  Aino Virtanen ',
      q_email: 'Aino.Virtanen@Example.com',
    };
    expect(check('cust-aino', ebike, answers)).toEqual([]);
    const owners = {
      ...own('cust-haapala'),
      q_beneficial_owners: ['Jussi Haapala (60 %)', ' Maria Haapala (40 %)', ''],
    };
    expect(check('cust-haapala', tractor, owners)).toEqual([]);
    expect(
      check('cust-haapala', tractor, { ...owners, q_beneficial_owners: ['Jussi Haapala (100 %)'] })
    ).toEqual(['q_beneficial_owners']);
  });

  it('compares a record value that fails validation as it is (Typo Trading’s 1234567-8)', () => {
    expect(check('cust-broken-id', tractor, own('cust-broken-id'))).toEqual([]);
    expect(
      check('cust-broken-id', tractor, { ...own('cust-broken-id'), q_business_id: '1234567-1' })
    ).toEqual(['q_business_id']);
  });

  it('treats money sent as text as a mismatch, not as the same cents', () => {
    const answers = { ...own('cust-aino'), q_monthly_income: '320000' };
    expect(check('cust-aino', ebike, answers)).toEqual(['q_monthly_income']);
  });
});
