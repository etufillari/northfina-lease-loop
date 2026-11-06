// Signs and verifies the token behind the no-password "acting as" login. Identity itself
// is simulated (there is no password check), but the token is a real signed JWT: a cookie
// edited by hand will not verify, so a route can trust the role inside one that does.
//
// The secret and "now" are arguments, not read from process.env or the clock in here, so
// this is easy to test. `src/server/auth/actor.ts` is what reads JWT_SECRET and the real clock
// and calls these.
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { isRole, type Role } from '@/domain/identity';
import { hours } from '@/lib/duration';

/** What the signed token carries: who is acting, and as which role. */
export type SessionPayload = {
  /** The identity's id: a customer id (cust-...) or a staff id (staff-...). */
  sub: string;
  role: Role;
};

export const SESSION_COOKIE_NAME = 'lease_loop_session';
export const SESSION_MAX_AGE_SECONDS = hours(12);

const ALG = 'HS256';
const encodeSecret = (secret: string) => new TextEncoder().encode(secret);

/** Signs a session token for `payload`, valid for `SESSION_MAX_AGE_SECONDS` starting at `now`. */
export async function signSession(
  payload: SessionPayload,
  secret: string,
  now: Date = new Date()
): Promise<string> {
  // SESSION_MAX_AGE_SECONDS is in seconds; Date math needs milliseconds, hence `* 1000`.
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000))
    .sign(encodeSecret(secret));
}

export type VerifySessionResult =
  { ok: true; payload: SessionPayload } | { ok: false; reason: 'invalid' | 'expired' };

/**
 * Verifies `token` against `secret` as of `now`. Never throws: a missing, tampered,
 * wrong-secret, wrong-shape or expired token is a normal "not logged in", not a bug.
 */
export async function verifySession(
  token: string,
  secret: string,
  now: Date = new Date()
): Promise<VerifySessionResult> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret), { currentDate: now });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0 || !isRole(payload.role)) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, payload: { sub: payload.sub, role: payload.role } };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}
