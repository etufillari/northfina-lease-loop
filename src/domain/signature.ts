// Card 6, "Who can sign?": a company applicant who may not sign for the company gives the
// email of the person who can (q_signatory_email). The application then waits for that
// person: it is saved, nothing is signed or invoiced, and the applicant can't sign it. The
// signatory (admin, Signatures, acting as them) either signs, which creates the contract on
// the applicant's account so the invoices go there, or declines, with an optional note.
//
// Which price is locked when the signatory signs on a later day? The quote's, as long as they
// sign within its validity (QUOTE_VALID_DAYS after the quote date, as in card 2). After that
// the request has expired and the company applies again at the prices of that day.
import { addDays, QUOTE_VALID_DAYS } from './contract';

export const SIGNATORY_RULE = 'signatory_authorization';

export type SignatureStatus =
  /** Waiting for the signatory, who can sign or decline. */
  | 'waiting'
  /** The signatory signed: the contract exists. */
  | 'signed'
  /** The signatory declined. */
  | 'declined'
  /** Nobody signed within the quote's validity. */
  | 'expired'
  /** A person must also review it for another reason (e.g. PEP), so it can't be signed yet. */
  | 'needs_review';

/** The signatory's email from the answers, or null. */
export function signatoryEmail(answers: Readonly<Record<string, string>>): string | null {
  return answers.q_signatory_email?.trim() || null;
}

/** Whether a decision went to manual review only because the applicant can't sign. */
export function waitsOnlyForSignatory(decision: string, reasons: readonly string[]): boolean {
  return (
    decision === 'manual_review' &&
    reasons.length > 0 &&
    reasons.every((reason) => reason === SIGNATORY_RULE)
  );
}

export type SignatureInput = {
  decision: string;
  reasons: readonly string[];
  quoteDate: string;
  /** The day the contract was signed, if it was. */
  signedDate: string | null;
  declinedDate: string | null;
  today: string;
};

/**
 * Where a signature request stands on `today`, or null when this is no signature request
 * (no signatory involved, or the application didn't exist yet on `today`). Signing and
 * declining only count from their own date, so travelling back shows the request waiting.
 */
export function signatureStatus(input: SignatureInput): SignatureStatus | null {
  if (!input.reasons.includes(SIGNATORY_RULE) || input.today < input.quoteDate) return null;
  if (input.signedDate !== null && input.signedDate <= input.today) return 'signed';
  if (input.declinedDate !== null && input.declinedDate <= input.today) return 'declined';
  if (!waitsOnlyForSignatory(input.decision, input.reasons)) return 'needs_review';
  if (input.today > signatureValidUntil(input.quoteDate)) return 'expired';
  return 'waiting';
}

/** The last day the signatory can sign at the quoted price. */
export function signatureValidUntil(quoteDate: string): string {
  return addDays(quoteDate, QUOTE_VALID_DAYS);
}
