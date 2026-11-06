// The words for a refused payment (POST /api/invoices/:id/pay): the route answers an error
// envelope with its own code, or a `FORBIDDEN` whose `details.code` is an authorization code
// (D74). Both are written from the message files in the visitor's language through
// `failureText`, which looks codes up with `Object.hasOwn`, so an inherited name such as
// "constructor" never reaches the page; anything else gets the generic "did not go through".
import { AUTHZ_REFUSAL_CODES } from '@/domain/authz/policy';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { failureText, type FailureLabels } from './api-failure';
import { authzRefusalKey } from './authz-refusal';

/** The pay route's own refusal codes, each with a message key. */
const PAY_REFUSALS: Record<string, MessageKey> = {
  INVOICE_ALREADY_PAID: 'invoice.pay.refusal.already_paid',
  INVOICE_CANCELLED: 'invoice.pay.refusal.cancelled',
  PAID_BEFORE_SIGNING: 'invoice.pay.refusal.before_signing',
};

/** The sentence for a failed pay response's body (or none, when the request itself failed). */
export function payRefusalText(locale: Locale, body: unknown): string {
  const t = getT(locale);
  const labels: FailureLabels = { error: t('invoice.pay.refusal.unknown') };
  for (const [code, key] of Object.entries(PAY_REFUSALS)) labels[code] = t(key);
  for (const code of AUTHZ_REFUSAL_CODES) {
    const key = authzRefusalKey(code);
    if (key) labels[code] = t(key);
  }
  return failureText(body, labels);
}
