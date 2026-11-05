// Complete, valid answers for the scenario-card applicants, so tests can focus on what changes.
import type { Answers } from '@/data/lease-schemas';

/** Aino on an e-bike: financed 200 000 to 999 999 asks for income, and nothing about PEP. */
export const ainoEbikeAnswers: Answers = {
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

/** Haapalan Tila on a farm machine over 5 000 000 financed (card 7), saying they are no PEP. */
export const haapalaFarmAnswers: Answers = {
  q_email: 'info@haapala.example.com',
  q_business_id: '2876543-5',
  q_company_name: 'Haapalan Tila Oy',
  q_can_sign: 'yes',
  q_vat_registered: 'yes',
  q_farm_registry: 'FR-12345',
  q_annual_revenue: 95_000_000,
  q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
  q_pep: 'no',
};

/** Norvi on e-bikes over 1 000 000 financed (card 6): the applicant cannot sign. */
export const norviEbikeAnswers: Answers = {
  q_email: 'fleet@norvi.example.com',
  q_business_id: '3299871-7',
  q_company_name: 'Norvi Logistics Oy',
  q_can_sign: 'no',
  q_signatory_email: 'ceo@norvi.example.com',
  q_vat_registered: 'yes',
  q_usage_purpose: 'delivery',
  q_pep: 'no',
};
