// The words for a refused signing (POST /api/contracts): the server answers a code with params
// (team rule 6) and this writes it from `contract.refusal.<code>` in the visitor's language.
// Days are written as dates and a decision as its status text; an unknown code or a response
// without one gets the generic "could not sign" message.
import { formatIsoDate } from '@/i18n/format';
import { authzRefusalKey } from './authz-refusal';
import { getT, messages, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

export type SignRefusalReason = { code?: unknown; params?: unknown } | null | undefined;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function signRefusalText(locale: Locale, reason: SignRefusalReason): string {
  const t = getT(locale);
  const authz = authzRefusalKey(reason?.code);
  if (authz) return t(authz);
  const key = `contract.refusal.${String(reason?.code)}`;
  if (!(key in messages.en)) return t('contract.sign.error');

  const raw =
    reason?.params && typeof reason.params === 'object'
      ? (reason.params as Record<string, unknown>)
      : {};
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === 'number') values[name] = value;
    else if (typeof value !== 'string') continue;
    else if (ISO_DAY.test(value)) values[name] = formatIsoDate(value, locale);
    else if (name === 'decision' && `decision.status.${value}` in messages.en) {
      values[name] = t(`decision.status.${value}` as MessageKey);
    } else values[name] = value;
  }
  return t(key as MessageKey, values);
}
