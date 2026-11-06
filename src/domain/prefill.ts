// Pre-filled application answers for a known customer (data/customers.json), so a customer
// who has "logged in" only answers what we can't know about them yet (for example what the
// e-bike is for). Every answer stays editable in the form.
import type { Customer } from '@/data/schemas';

const yesNo = (value: boolean) => (value ? 'yes' : 'no');

/** Cents → the euro amount the money questions expect, e.g. 320000 → "3200". */
const euros = (cents: number) => String(cents / 100);

export function prefillAnswers(customer: Customer): Record<string, string> {
  const shared = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_pep: yesNo(customer.is_pep),
  };
  switch (customer.type) {
    case 'consumer':
      return {
        ...shared,
        q_full_name: customer.name,
        q_birth_date: customer.birth_date,
        q_country: customer.country,
        q_employment: customer.employment,
        q_monthly_income: euros(customer.monthly_net_income_cents),
      };
    case 'sole_trader':
      return {
        ...shared,
        q_full_name: customer.name,
        q_birth_date: customer.birth_date,
        q_country: customer.country,
        q_business_id: customer.business_id,
        q_vat_registered: yesNo(customer.vat_registered),
      };
    case 'company':
      return {
        ...shared,
        q_company_name: customer.name,
        q_business_id: customer.business_id,
        q_vat_registered: yesNo(customer.vat_registered),
        q_can_sign: yesNo(customer.applicant_can_sign),
        q_annual_revenue: euros(customer.annual_revenue_cents),
        ...(customer.beneficial_owners
          ? { q_beneficial_owners: customer.beneficial_owners.join(', ') }
          : {}),
      };
  }
}
