// The words for a refusal of the authorization family (D73, D74): a 401/403 `FORBIDDEN` whose
// details are `{ code, params }` with one of the policy's codes. Null for anything else,
// so the caller falls back to its own refusal texts.
import { AUTHZ_REFUSAL_CODES } from '@/domain/authz/policy';
import type { MessageKey } from '@/i18n/get-t';

export function authzRefusalKey(code: unknown): MessageKey | null {
  return typeof code === 'string' && (AUTHZ_REFUSAL_CODES as readonly string[]).includes(code)
    ? (`authz.refusal.${code}` as MessageKey)
    : null;
}
