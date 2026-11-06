// The authorization refusals (D73) as the services answer them, for the tests' expectations.
import type { AuthzAction, AuthzRefusal, AuthzRefusalCode } from '@/domain/authz/policy';

/** The refusal itself: `{ code, params: { action } }`. */
export const refusal = (code: AuthzRefusalCode, action: AuthzAction): AuthzRefusal => ({
  code,
  params: { action },
});

/** A service with string reasons: `{ ok: false, reason: 'forbidden', refusal }`. */
export const forbidden = (code: AuthzRefusalCode, action: AuthzAction) => ({
  ok: false as const,
  reason: 'forbidden' as const,
  refusal: refusal(code, action),
});
