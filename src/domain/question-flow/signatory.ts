// Who decides an application that is still open (D10, D39, D46). There is no login (D17): the
// actor is the "continue as" picker's customer or the admin. A manual review is the admin's.
// A case waiting for the company's signatory is signed or declined only through the signing
// link sent to the signatory (`signingCheck` in src/domain/signatories/mandates.ts): not on
// the company's account, where the applicant who may not sign is, and not by the admin, who
// reviews but never signs for a company.
import type { ApplicationDecision } from '@/domain/statuses';
import { normaliseEmail } from '@/domain/signatories/mandates';

/** Two e-mail addresses are the same one: case and the spaces around them do not count. */
export function sameEmail(a: string | undefined, b: string | undefined): boolean {
  const left = a === undefined ? '' : normaliseEmail(a);
  return left !== '' && left === (b === undefined ? '' : normaliseEmail(b));
}

/**
 * How an application in `decision` is decided from here: the admin on the decision page
 * (`admin`), the named signatory through the signing link (`signing_link`), or not at all
 * (`final`).
 */
export function whoDecides(decision: ApplicationDecision): 'admin' | 'signing_link' | 'final' {
  if (decision === 'manual_review') return 'admin';
  if (decision === 'awaiting_signatory') return 'signing_link';
  return 'final';
}
