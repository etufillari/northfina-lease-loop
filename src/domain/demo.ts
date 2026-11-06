// Demo-mode rules: which "today" a presenter may pick, and how a data-pack persona fills in
// the application. Pure: the caller supplies the cookie value, the real date and the persona.
import type { Customer } from '@/data/schemas';
import type { ApplicationAnswers } from './application';
import { isCalendarDate } from './application-fields';

/**
 * The demo clock covers the data pack: price list v1 starts on 2026-01-01 (scenario card 4
 * starts on 2026-01-31) and a 60-month lease signed in 2026 ends in 2031.
 */
export const DEMO_DATE_MIN = '2026-01-01';
export const DEMO_DATE_MAX = '2031-12-31';

/** A valid calendar date inside the demo range, or null for anything else. */
export function parseDemoDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !isCalendarDate(value)) return null;
  return value >= DEMO_DATE_MIN && value <= DEMO_DATE_MAX ? value : null;
}

/** The date the app treats as today: the demo date when demo mode is on and it is valid. */
export function effectiveToday(
  demoValue: string | null | undefined,
  demoEnabled: boolean,
  realToday: string
): string {
  return (demoEnabled && parseDemoDate(demoValue)) || realToday;
}

const supportedCountries = new Set(['FI', 'SE', 'EE']);
const yesNo = (value: boolean) => (value ? 'yes' : 'no');

/**
 * Answers a persona can give from its data-pack record. Questions the record can't answer
 * (usage purpose, farm registry, signatory e-mail, PEP details) are left for the presenter,
 * and answers to questions that don't apply are pruned by the question engine as usual.
 */
export function personaAnswers(customer: Customer): ApplicationAnswers {
  const shared: ApplicationAnswers = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_pep: yesNo(customer.is_pep),
  };
  if (customer.type === 'company') {
    return {
      ...shared,
      q_company_name: customer.name,
      q_business_id: customer.business_id,
      q_vat_registered: yesNo(customer.vat_registered),
      q_can_sign: yesNo(customer.applicant_can_sign),
      q_annual_revenue: customer.annual_revenue_cents,
      ...(customer.beneficial_owners?.length
        ? { q_beneficial_owners: customer.beneficial_owners }
        : {}),
    };
  }
  const person: ApplicationAnswers = {
    ...shared,
    q_full_name: customer.name,
    q_birth_date: customer.birth_date,
    q_country: supportedCountries.has(customer.country) ? customer.country : 'other',
  };
  if (customer.type === 'sole_trader') {
    return {
      ...person,
      q_business_id: customer.business_id,
      q_vat_registered: yesNo(customer.vat_registered),
    };
  }
  return {
    ...person,
    q_employment: customer.employment,
    q_monthly_income: customer.monthly_net_income_cents,
  };
}
