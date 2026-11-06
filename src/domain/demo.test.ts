import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, QuestionsFile } from '@/data/schemas';
import { assessApplication, type ApplicationContext } from './application';
import {
  DEMO_DATE_MAX,
  DEMO_DATE_MIN,
  effectiveToday,
  parseDemoDate,
  personaAnswers,
} from './demo';

let customers: Customer[];
let bank: QuestionsFile;
beforeAll(async () => {
  [customers, bank] = await Promise.all([loadCustomers(), loadQuestions()]);
});
const persona = (id: string) => customers.find((customer) => customer.id === id)!;

describe('parseDemoDate', () => {
  it('accepts calendar dates inside the demo range, including both ends and leap days', () => {
    for (const date of [DEMO_DATE_MIN, '2026-01-31', '2028-02-29', DEMO_DATE_MAX])
      expect(parseDemoDate(date)).toBe(date);
  });
  it('rejects malformed, impossible and out-of-range values', () => {
    for (const value of [
      undefined,
      null,
      '',
      '2026-1-5',
      '2026-02-29',
      '2025-12-31',
      '2032-01-01',
      '2026-11-05T00:00',
      ' 2026-11-05',
    ])
      expect(parseDemoDate(value)).toBeNull();
  });
});

describe('effectiveToday', () => {
  it('uses a valid demo date only when demo mode is on', () => {
    expect(effectiveToday('2026-11-05', true, '2026-11-06')).toBe('2026-11-05');
    expect(effectiveToday('2026-11-05', false, '2026-11-06')).toBe('2026-11-06');
  });
  it('falls back to the real date for a missing or invalid demo date', () => {
    expect(effectiveToday(undefined, true, '2026-11-06')).toBe('2026-11-06');
    expect(effectiveToday('1999-01-01', true, '2026-11-06')).toBe('2026-11-06');
  });
});

describe('personaAnswers', () => {
  it('fills a consumer from the data pack, with income in cents', () => {
    expect(personaAnswers(persona('cust-aino'))).toEqual({
      q_customer_type: 'consumer',
      q_email: 'aino.virtanen@example.com',
      q_pep: 'no',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_country: 'FI',
      q_employment: 'employed',
      q_monthly_income: 320000,
    });
  });
  it('keeps supported countries and maps any other country to "other"', () => {
    expect(personaAnswers(persona('cust-lena')).q_country).toBe('EE');
    const abroad = { ...persona('cust-aino'), country: 'DE' } as Customer;
    expect(personaAnswers(abroad).q_country).toBe('other');
  });
  it('fills a sole trader with a business ID and no income question', () => {
    const answers = personaAnswers(persona('cust-pekka'));
    expect(answers).toMatchObject({
      q_customer_type: 'sole_trader',
      q_full_name: 'Pekka Korhonen',
      q_business_id: '3012456-5',
      q_vat_registered: 'yes',
    });
    expect(answers.q_monthly_income).toBeUndefined();
  });
  it('fills a company, including signing authority, PEP and beneficial owners', () => {
    expect(personaAnswers(persona('cust-norvi'))).toMatchObject({
      q_customer_type: 'company',
      q_company_name: 'Norvi Logistics Oy',
      q_can_sign: 'no',
      q_annual_revenue: 410000000,
    });
    expect(personaAnswers(persona('cust-norvi')).q_beneficial_owners).toBeUndefined();
    expect(personaAnswers(persona('cust-haapala'))).toMatchObject({
      q_pep: 'yes',
      q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
    });
  });
  it('gives every persona answers the question engine accepts', () => {
    for (const customer of customers) {
      const answers = personaAnswers(customer);
      for (const value of Object.values(answers))
        expect(
          typeof value === 'string' || Array.isArray(value) || Number.isSafeInteger(value)
        ).toBe(true);
    }
  });

  describe('scenario cards with prefilled answers', () => {
    const context: ApplicationContext = {
      categories: ['laptop'],
      financedCents: 289000,
      monthlyTotalCents: 10000,
      termMonths: 36,
      startDate: '2026-11-05',
      minimumCents: 30000,
      maximumCents: 25000000,
    };
    it('card 5: Mikko (17) is rejected for his age', () => {
      expect(assessApplication(bank, context, personaAnswers(persona('cust-mikko')))).toMatchObject(
        { status: 'rejected', reasons: expect.arrayContaining(['under_age']) }
      );
    });
    it('a broken business ID check digit is rejected', () => {
      const answers = personaAnswers(persona('cust-broken-id'));
      expect(assessApplication(bank, context, answers).reasons).toContain('business_id');
    });
  });
});
