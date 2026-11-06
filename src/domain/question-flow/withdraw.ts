// D87: an applicant may step back from an application that is not a lease yet. An approved one
// not signed, a manual review still waiting for a person and a company case waiting for its
// signatory can be withdrawn; a rejected or already withdrawn one is final, and a signed one is
// a contract (ended through the exits, never withdrawn). Withdrawn is a decision of its own, so
// signing (`application_not_approved`), the review (`whoDecides` → final) and the signing link
// all refuse it without a rule of their own.
import type { ApplicationDecision } from '@/domain/statuses';

/** The decisions an unsigned application can be withdrawn from. */
export const WITHDRAWABLE: readonly ApplicationDecision[] = [
  'approved',
  'manual_review',
  'awaiting_signatory',
];

export type WithdrawRefusal = {
  code: 'already_signed' | 'not_withdrawable';
  params: { decision: ApplicationDecision };
};

/** Whether an application in `decision` may be withdrawn; `signed`: it already has a contract. */
export function withdrawalCheck(
  decision: ApplicationDecision,
  signed: boolean
): { ok: true } | { ok: false; reason: WithdrawRefusal } {
  if (signed) return { ok: false, reason: { code: 'already_signed', params: { decision } } };
  if (!WITHDRAWABLE.includes(decision)) {
    return { ok: false, reason: { code: 'not_withdrawable', params: { decision } } };
  }
  return { ok: true };
}
