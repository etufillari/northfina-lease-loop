// The applicant's answers against the customer record we already hold (D38). An answer that
// differs is not refused (the record may be out of date, a sole trader may have incorporated),
// but the case is never approved by a rule: a person checks it. Without this, a 17-year-old
// consumer could answer "company" and the age question would never be asked, a consumer could
// type a bigger income to pass affordability, and a coordinator who may not sign could answer
// "yes, I can sign".
import type { Customer } from '@/data/schemas';
import type { Answer, Answers } from './engine';
import { ALLOWED_COUNTRIES } from './eligibility';

const text = (answer: Answer | undefined): string | undefined =>
  typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : undefined;

/** Cents as digits compare as numbers ("0320000" is 320 000); anything else as text. */
const sameCents = (answer: string, recorded: string) =>
  /^\d+$/.test(answer) ? Number(answer) === Number(recorded) : answer === recorded;

/**
 * A person's name as words to compare: case, extra spaces, accents and word order ignored, so
 * "mäkelä sanna" and "Sanna Makela" are the record's "Sanna Mäkelä". A different name is not.
 */
export function nameWords(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .sort()
    .join(' ');
}

type Recorded = { value: string | undefined; same?: (answer: string, recorded: string) => boolean };

/**
 * The question ids whose answer differs from the record, in the bank's order: the customer
 * type, the full name (a person's, not a company's; see `nameWords`), the birth date, the e-mail (case ignored), the country (a country outside FI, SE and
 * EE is answered "other"), the monthly net income, the business id, whether the applicant can
 * sign, the annual revenue, and a PEP on record who answers "no" (D58). A question not answered, or a field the record does not have,
 * is not compared.
 */
export function recordMismatches(record: Customer, answers: Answers): string[] {
  const recorded: Record<string, Recorded> = {
    q_customer_type: { value: record.type },
    // Asked of consumers and sole traders; a company's record name is the company's.
    q_full_name: {
      value: record.type === 'company' ? undefined : record.name,
      same: (a, r) => nameWords(a) === nameWords(r),
    },
    q_birth_date: { value: 'birth_date' in record ? record.birth_date : undefined },
    q_email: { value: record.email, same: (a, r) => a.toLowerCase() === r.toLowerCase() },
    q_country: { value: ALLOWED_COUNTRIES.includes(record.country) ? record.country : 'other' },
    q_monthly_income: {
      value:
        'monthly_net_income_cents' in record ? String(record.monthly_net_income_cents) : undefined,
      same: sameCents,
    },
    q_business_id: { value: 'business_id' in record ? record.business_id : undefined },
    q_can_sign: {
      value:
        'applicant_can_sign' in record ? (record.applicant_can_sign ? 'yes' : 'no') : undefined,
    },
    q_annual_revenue: {
      value: 'annual_revenue_cents' in record ? String(record.annual_revenue_cents) : undefined,
      same: sameCents,
    },
    // a PEP on record who answers "no" is held; a "yes" the record lacks holds as `pep` anyway
    q_pep: { value: record.is_pep ? 'yes' : undefined },
  };
  return Object.entries(recorded)
    .filter(([id, { value, same }]) => {
      const answer = text(answers[id]);
      if (value === undefined || answer === undefined) return false;
      return !(same ?? ((a: string, r: string) => a === r))(answer, value.trim());
    })
    .map(([id]) => id);
}
