// Turns a data-pack customer into answers for the question bank, so a demo can fill the form
// as a persona. Questions the record says nothing about (usage purpose, farm registry,
// signatory email, PEP details) stay unanswered and are asked as usual. When an application
// names a persona, the server checks the answers against the same record.
import type { Customer, Question } from '@/data/schemas';
import {
  relevantAnswers,
  validateAnswer,
  type AnswerValue,
  type Answers,
  type Deal,
} from './question-flow';

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

/**
 * The questions whose answer contradicts the customer's record, in the question bank's order
 * (D-031). Every answer `answersFromCustomer` fills is a fact on record; anything else (usage
 * purpose, farm registry, signatory email, PEP details) is the applicant's own choice. Only
 * answers that apply to the deal are compared (D-022), and a missing answer is left to the
 * application, which stays incomplete. Text is compared trimmed, emails without case.
 */
export function answersNotMatchingCustomer(
  questions: readonly Question[],
  deal: Deal,
  customer: Customer,
  answers: Answers
): string[] {
  const facts = answersFromCustomer(customer);
  const { answers: applying } = relevantAnswers(questions, deal, answers);
  return questions
    .filter((question) => {
      const given = applying[question.id];
      const fact = facts[question.id];
      if (given === undefined || fact === undefined) return false;
      return comparable(question, given) !== comparable(question, fact);
    })
    .map((question) => question.id);
}

/** One canonical text per answer: validated and trimmed when it can be, raw when it can't. */
function comparable(question: Question, value: AnswerValue): string {
  const check = validateAnswer(question, value);
  const normal = check.ok ? check.value : value;
  const text = JSON.stringify(normal);
  return question.type === 'email' ? text.toLowerCase() : text;
}
