// Turns a data-pack customer into answers for the question bank, so a demo can fill the form
// as a persona. Questions the record says nothing about (usage purpose, farm registry,
// signatory email, PEP details) stay unanswered and are asked as usual.
import type { Customer } from '@/data/schemas';
import type { AnswerValue, Answers } from './question-flow';

const yesNo = (value: boolean) => (value ? 'yes' : 'no');
/** The question offers FI, SE, EE and `other`. */
const country = (code: string) => (['FI', 'SE', 'EE'].includes(code) ? code : 'other');

export function answersFromCustomer(customer: Customer): Answers {
  const answers: Record<string, AnswerValue> = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_pep: yesNo(customer.is_pep),
  };
  switch (customer.type) {
    case 'consumer':
      Object.assign(answers, {
        q_full_name: customer.name,
        q_birth_date: customer.birth_date,
        q_country: country(customer.country),
        q_employment: customer.employment,
        q_monthly_income: customer.monthly_net_income_cents,
      });
      break;
    case 'sole_trader':
      Object.assign(answers, {
        q_full_name: customer.name,
        q_birth_date: customer.birth_date,
        q_country: country(customer.country),
        q_business_id: customer.business_id,
        q_vat_registered: yesNo(customer.vat_registered),
      });
      break;
    case 'company':
      Object.assign(answers, {
        q_business_id: customer.business_id,
        q_company_name: customer.name,
        q_can_sign: yesNo(customer.applicant_can_sign),
        q_vat_registered: yesNo(customer.vat_registered),
        q_annual_revenue: customer.annual_revenue_cents,
      });
      if (customer.beneficial_owners) answers.q_beneficial_owners = customer.beneficial_owners;
      break;
  }
  return answers;
}
