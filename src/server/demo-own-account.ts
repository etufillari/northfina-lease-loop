// "Current user" in the demo bar: a presenter signed in with their own account can switch to
// personas and come back. On the first switch away from a non-persona account, its session is
// kept in a separate HttpOnly cookie; choosing "Current user" puts that session back. Nothing is
// stored server side and no session is made up: it's the browser's own earlier sign-in.
import type { PrismaClient } from '@/generated/prisma/client';
import { ApiError, ok } from './api-response';
import { withAudit } from './audit';
import type { AuthSettings } from './auth-config';
import { readIdentity, type AccountIdentity } from './auth-session';
import { cookieFrom } from './demo-mode';

export const CURRENT_USER_ID = 'current-user';
export const OWN_SESSION_COOKIE = 'lease-loop.demo-own-session';
const WEEK_SECONDS = 604_800;

/** The auth library's session cookie (see `cookiePrefix` and secure cookies in auth-config). */
export const sessionCookieName = (settings: AuthSettings) =>
  `${settings.production ? '__Secure-' : ''}lease-loop.session_token`;

const cookie = (name: string, value: string, settings: AuthSettings, maxAge = WEEK_SECONDS) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${settings.production ? '; Secure' : ''}`;

/** True for the accounts the demo bar signs in as (data-pack personas and demo staff). */
export function isPersonaAccount(
  customerId: string,
  personas: readonly { id: string; staff: boolean }[]
): boolean {
  return personas.some((persona) =>
    persona.staff ? customerId === `${persona.id}-customer` : customerId === persona.id
  );
}

/**
 * Before switching to a persona: the Set-Cookie that keeps the visitor's own session, or null
 * when they are signed out or already a persona (an earlier kept session stays as it was).
 */
export async function keepOwnSession(
  database: PrismaClient,
  request: Request,
  settings: AuthSettings,
  personas: readonly { id: string; staff: boolean }[]
): Promise<string | null> {
  const identity = await readIdentity(database, request.headers, settings);
  if (!identity || isPersonaAccount(identity.customerId, personas)) return null;
  const token = cookieFrom(request.headers.get('cookie'), sessionCookieName(settings));
  return token ? cookie(OWN_SESSION_COOKIE, token, settings) : null;
}

/** The kept own account, if its session is still valid. */
export async function ownAccount(
  database: PrismaClient,
  cookieHeader: string | null,
  settings: AuthSettings
): Promise<{ identity: AccountIdentity; token: string } | null> {
  const token = cookieFrom(cookieHeader, OWN_SESSION_COOKIE);
  if (!token) return null;
  const identity = await readIdentity(
    database,
    new Headers({ cookie: `${sessionCookieName(settings)}=${token}` }),
    settings
  );
  return identity ? { identity, token } : null;
}

/** "Current user": signs the browser back in with its own kept session. */
export async function returnToOwnAccount(
  database: PrismaClient,
  request: Request,
  settings: AuthSettings
): Promise<Response> {
  const own = await ownAccount(database, request.headers.get('cookie'), settings);
  if (!own) throw new ApiError(404, 'NO_OWN_ACCOUNT', 'Sign in with your own account to use this.');
  await withAudit(
    database,
    {
      actor: own.identity.id,
      action: 'demo.persona_switched',
      entityType: 'customer',
      entityId: own.identity.customerId,
      details: { personaId: CURRENT_USER_ID },
    },
    async () => undefined
  );
  // A persona's scenario cart isn't the user's: start them with an empty one.
  const response = ok(
    { personaId: CURRENT_USER_ID, staff: own.identity.role === 'staff', cart: [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.headers.append('Set-Cookie', cookie(sessionCookieName(settings), own.token, settings));
  response.headers.append('Set-Cookie', cookie(OWN_SESSION_COOKIE, '', settings, 0));
  return response;
}
