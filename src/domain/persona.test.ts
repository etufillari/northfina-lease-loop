import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from './persona';

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
