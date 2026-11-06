// Who may sign for a company on a day (D46): the company's list of authorised signatories,
// each valid over a range of days, and the signing link sent to one of them. In production
// the trade register and Suomi.fi e-Authorizations give the list and the link identifies the
// person; here the list is a table and opening the link stands in for both.
//
// Ranges are half-open: a right holds from `validFrom` (inclusive) up to, not including,
// `validTo`, so revoking on a day means the right no longer holds that day. A link works
// up to, not including, its `expiresOn`.
import { addDays } from '@/domain/civil-days';

export type Mandate = {
  id: string;
  /** Stored trimmed and lower case (`normaliseEmail`). */
  email: string;
  /** Null while the entry waits for its signing link to be opened: not yet in force. */
  validFrom: string | null;
  validTo: string | null;
};

/** The days a signing link works for, counted from the day it is sent (like a quote, D7). */
export const REQUEST_VALID_DAYS = 14;

/** An e-mail as stored and compared: the spaces around it and the case do not count. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isActive(mandate: Mandate, onDate: string): boolean {
  return (
    mandate.validFrom !== null &&
    mandate.validFrom <= onDate &&
    (mandate.validTo === null || onDate < mandate.validTo)
  );
}

/** The entries whose right holds on `onDate`. */
export function activeSignatories<M extends Mandate>(list: readonly M[], onDate: string): M[] {
  return list.filter((mandate) => isActive(mandate, onDate));
}

/** Whether `email` is an active signatory on `onDate` (case and spaces ignored). */
export function canSign(list: readonly Mandate[], email: string, onDate: string): boolean {
  const wanted = normaliseEmail(email);
  return (
    wanted !== '' && activeSignatories(list, onDate).some((m) => normaliseEmail(m.email) === wanted)
  );
}

export type RevokeResult<M extends Mandate> =
  { ok: true; mandate: M } | { ok: false; code: 'not_found' | 'already_ended' | 'last_signatory' };

/**
 * Ends the right of `id` on `onDate`: from that day it no longer holds. The last active
 * signatory cannot be revoked (`last_signatory`): the company would have nobody left to sign,
 * and a new one is added first. An entry not yet in force ends before it starts.
 */
export function revoke<M extends Mandate>(
  list: readonly M[],
  id: string,
  onDate: string
): RevokeResult<M> {
  const mandate = list.find((m) => m.id === id);
  if (!mandate) return { ok: false, code: 'not_found' };
  if (mandate.validTo !== null && mandate.validTo <= onDate) {
    return { ok: false, code: 'already_ended' };
  }
  if (isActive(mandate, onDate) && activeSignatories(list, onDate).length === 1) {
    return { ok: false, code: 'last_signatory' };
  }
  if (mandate.validFrom === null || mandate.validFrom > onDate) {
    const start = mandate.validFrom ?? onDate;
    return { ok: true, mandate: { ...mandate, validFrom: start, validTo: start } };
  }
  return { ok: true, mandate: { ...mandate, validTo: onDate } };
}

export type SignatureRequestDays = {
  expiresOn: string;
  signedOn: string | null;
  declinedOn: string | null;
};

export type RequestOutcome =
  | { code: 'pending'; params: Record<string, never> }
  | { code: 'expired'; params: { expiresOn: string } }
  | { code: 'already_used'; params: { outcome: 'signed' | 'declined'; on: string } };

/** The day a link sent on `sentOn` stops working. */
export function requestExpiresOn(sentOn: string): string {
  return addDays(sentOn, REQUEST_VALID_DAYS);
}

/** The state of a signing link on `onDate`: used first (a used link stays used), then expired. */
export function requestOutcome(request: SignatureRequestDays, onDate: string): RequestOutcome {
  if (request.signedOn !== null) {
    return { code: 'already_used', params: { outcome: 'signed', on: request.signedOn } };
  }
  if (request.declinedOn !== null) {
    return { code: 'already_used', params: { outcome: 'declined', on: request.declinedOn } };
  }
  if (onDate >= request.expiresOn) {
    return { code: 'expired', params: { expiresOn: request.expiresOn } };
  }
  return { code: 'pending', params: {} };
}

export type SigningCheck =
  | { ok: true; activates: boolean }
  | {
      ok: false;
      code: 'expired' | 'already_used' | 'signatory_not_active';
    };

/**
 * Whether the signatory of a link may sign or decline with it on `onDate`. The link must be
 * pending. An entry still waiting for its link comes into force by the opening (`activates`:
 * the server sets its `validFrom` to the day); an entry already in force must be active, so a
 * signatory revoked after the link was sent cannot use it.
 */
export function signingCheck(
  request: SignatureRequestDays,
  signatory: Mandate,
  onDate: string
): SigningCheck {
  const outcome = requestOutcome(request, onDate);
  if (outcome.code !== 'pending') return { ok: false, code: outcome.code };
  if (signatory.validFrom === null && signatory.validTo === null) {
    return { ok: true, activates: true };
  }
  return isActive(signatory, onDate)
    ? { ok: true, activates: false }
    : { ok: false, code: 'signatory_not_active' };
}
