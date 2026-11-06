// Company contracts that someone else must sign (scenario card 6). The applicant may not sign
// for the company, so they name who can; the contract is prepared with its price locked and
// waits for that person. Nothing is active or billed until they sign. Pure: dates are arguments.
import type { ApplicationAnswers } from './application';

export const AWAITING_SIGNATURE = 'awaiting_signature';

/** The person who must sign, when a company applicant said they can't; otherwise null. */
export function pendingSignatory(answers: ApplicationAnswers): string | null {
  if (answers.q_customer_type !== 'company' || answers.q_can_sign !== 'no') return null;
  const email = answers.q_signatory_email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

/** A new contract is active at once, unless it waits for the company's signatory. */
export function initialContractStatus(signatory: string | null): 'active' | 'awaiting_signature' {
  return signatory ? AWAITING_SIGNATURE : 'active';
}

export type SignatorySigning =
  | { ok: true; startDate: string; signedOn: string }
  | { ok: false; reason: 'not_awaiting' | 'invalid_date' };

/**
 * The signatory signs on `today`. Billing starts on the signing day, never before the date the
 * contract was prepared for. The locked price, term and buyout don't change.
 */
export function signatorySigning(
  contract: { status: string; startDate: string },
  today: string
): SignatorySigning {
  if (contract.status !== AWAITING_SIGNATURE) return { ok: false, reason: 'not_awaiting' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, reason: 'invalid_date' };
  return {
    ok: true,
    startDate: today > contract.startDate ? today : contract.startDate,
    signedOn: today,
  };
}
