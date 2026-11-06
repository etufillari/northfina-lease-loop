import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from './answers';
import { nameWords, recordMismatches } from './record-check';

let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});
const customer = (id: string) => customers.find((c) => c.id === id)!;

describe('recordMismatches (D38)', () => {
  it('every persona answering from their own record matches it', () => {
    for (const c of customers) {
      expect(recordMismatches(c, answersFromCustomer(c)), c.id).toEqual([]);
    }
  });

  it('the trap: card 5 Mikko, a consumer on record, answers "company" and names it', () => {
    const answers = {
      q_customer_type: 'company',
      q_business_id: '0737546-2',
      q_company_name: 'Mikko Oy',
    };
    expect(recordMismatches(customer('cust-mikko'), answers)).toEqual(['q_customer_type']);
  });

  it('a birth date or a country other than the record is named', () => {
    const answers = {
      ...answersFromCustomer(customer('cust-mikko')),
      q_birth_date: '2000-03-10',
      q_country: 'SE',
    };
    expect(recordMismatches(customer('cust-mikko'), answers)).toEqual([
      'q_birth_date',
      'q_country',
    ]);
  });

  it('a country outside FI, SE and EE on record is answered as "other"', () => {
    const abroad = { ...customer('cust-aino'), country: 'DE' } as Customer;
    expect(recordMismatches(abroad, { q_country: 'other' })).toEqual([]);
    expect(recordMismatches(abroad, { q_country: 'FI' })).toEqual(['q_country']);
  });

  it('a business id other than the record is named; spaces around it are not a difference', () => {
    const norvi = customer('cust-norvi');
    const recorded = norvi.type === 'company' ? norvi.business_id : '';
    expect(recordMismatches(norvi, { q_business_id: ` ${recorded} ` })).toEqual([]);
    expect(recordMismatches(norvi, { q_business_id: '0737546-2' })).toEqual(['q_business_id']);
  });

  it('the trap: card 6 Norvi’s coordinator, who may not sign on record, answers "yes"', () => {
    const norvi = customer('cust-norvi');
    expect(recordMismatches(norvi, { q_can_sign: 'yes' })).toEqual(['q_can_sign']);
    expect(recordMismatches(norvi, { q_can_sign: 'no' })).toEqual([]);
    // the other way round is a difference too: the record is what we hold
    expect(recordMismatches(customer('cust-kettukoodi'), { q_can_sign: 'no' })).toEqual([
      'q_can_sign',
    ]);
    // a consumer record has no signing right to compare
    expect(recordMismatches(customer('cust-aino'), { q_can_sign: 'yes' })).toEqual([]);
  });

  it('a PEP on record who answers "no" is named; a "yes" without a record PEP is not (it holds as pep)', () => {
    const haapala = customer('cust-haapala');
    expect(recordMismatches(haapala, { ...answersFromCustomer(haapala), q_pep: 'no' })).toEqual([
      'q_pep',
    ]);
    const aino = customer('cust-aino');
    expect(recordMismatches(aino, { ...answersFromCustomer(aino), q_pep: 'yes' })).toEqual([]);
  });

  it('a question not answered is not compared, nor one the record does not know', () => {
    expect(recordMismatches(customer('cust-aino'), {})).toEqual([]);
    // a consumer record has no business id
    expect(recordMismatches(customer('cust-aino'), { q_business_id: '0737546-2' })).toEqual([]);
  });
  it('review finding 2, card 6: Norvi answering "yes, I can sign" differs from the record', () => {
    const { q_signatory_email: _named, ...norvi } = answersFromCustomer(customer('cust-norvi'));
    const answers = { ...norvi, q_can_sign: 'yes' };
    expect(recordMismatches(customer('cust-norvi'), answers)).toEqual(['q_can_sign']);
    // and a company that can sign, answering "no", is named too
    const kettu = { ...answersFromCustomer(customer('cust-kettukoodi')), q_can_sign: 'no' };
    expect(recordMismatches(customer('cust-kettukoodi'), kettu)).toEqual(['q_can_sign']);
  });

  it('review finding 4: an income other than the record is named; leading zeros are not', () => {
    const aino = customer('cust-aino');
    const answers = answersFromCustomer(aino);
    expect(recordMismatches(aino, { ...answers, q_monthly_income: '0320000' })).toEqual([]);
    expect(recordMismatches(aino, { ...answers, q_monthly_income: '900000' })).toEqual([
      'q_monthly_income',
    ]);
  });

  it('a company revenue other than the record is named', () => {
    const kettu = customer('cust-kettukoodi');
    const answers = { ...answersFromCustomer(kettu), q_annual_revenue: '999900000' };
    expect(recordMismatches(kettu, answers)).toEqual(['q_annual_revenue']);
  });

  it('the applicant e-mail is compared with the record, case and spaces ignored', () => {
    const norvi = customer('cust-norvi');
    const answers = answersFromCustomer(norvi);
    expect(recordMismatches(norvi, { ...answers, q_email: ' FLEET@norvi.example.com ' })).toEqual(
      []
    );
    expect(recordMismatches(norvi, { ...answers, q_email: 'boss@norvi.example.com' })).toEqual([
      'q_email',
    ]);
  });

  it('every new field at once comes back in the bank order', () => {
    const kettu = customer('cust-kettukoodi');
    const answers = {
      ...answersFromCustomer(kettu),
      q_annual_revenue: '1',
      q_can_sign: 'no',
      q_email: 'x@example.com',
    };
    expect(recordMismatches(kettu, answers)).toEqual(['q_email', 'q_can_sign', 'q_annual_revenue']);
  });

  it('Panu’s finding: a full name other than the record is named, so a person checks it', () => {
    const answers = {
      ...answersFromCustomer(customer('cust-aino')),
      q_full_name: 'Maija Meikäläinen',
    };
    expect(recordMismatches(customer('cust-aino'), answers)).toEqual(['q_full_name']);
  });

  it('the same name typed differently is not a difference: case, spaces, accents, word order', () => {
    const sanna = customer('cust-sanna'); // Sanna Mäkelä on record
    for (const typed of ['sanna mäkelä', '  Sanna   Mäkelä ', 'Sanna Makela', 'Mäkelä Sanna']) {
      const answers = { ...answersFromCustomer(sanna), q_full_name: typed };
      expect(recordMismatches(sanna, answers), typed).toEqual([]);
    }
  });

  it('a sole trader’s name is compared too (the record names the person)', () => {
    const pekka = customer('cust-pekka');
    const answers = { ...answersFromCustomer(pekka), q_full_name: 'Someone Else' };
    expect(recordMismatches(pekka, answers)).toEqual(['q_full_name']);
  });

  it('a company’s record name is a company, never compared with a person’s name', () => {
    const answers = { q_customer_type: 'company', q_full_name: 'Anyone' };
    expect(recordMismatches(customer('cust-kettukoodi'), answers)).toEqual([]);
  });
});

describe('nameWords', () => {
  it('drops case, extra spaces and accents, and sorts the words', () => {
    expect(nameWords('  Sanna   Mäkelä ')).toBe('makela sanna');
    expect(nameWords('Mäkelä Sanna')).toBe(nameWords('sanna makela'));
  });

  it('keeps a hyphenated surname as one word and an empty name empty', () => {
    expect(nameWords('Anna-Liisa Ström')).toBe('anna-liisa strom');
    expect(nameWords('   ')).toBe('');
  });
});
