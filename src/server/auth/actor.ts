// Turns the session cookie into "who is acting now", for API routes and pages alike.
// This is the one place that reads JWT_SECRET and the real clock; everything it calls
// (session.ts, identity.ts) is otherwise fully testable without either.
import { cookies } from 'next/headers';
import { loadCustomers, loadStaff } from '@/data/load';
import { can, findIdentity, type Identity, type Permission } from '@/domain/identity';
import type { Customer } from '@/data/schemas';
import { ApiError } from '../api-response';
import { SESSION_COOKIE_NAME, verifySession } from './session';

/** Reads JWT_SECRET. A missing value is a setup bug (see `.env.example`), not a login
 *  problem, so it throws rather than quietly treating every request as logged out. */
export function sessionSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set. Add it to .env (see .env.example).');
  return secret;
}

/**
 * The identity behind a session token, or `null` if there is none, or it is invalid or
 * expired. The testable core of `getActor`: no cookies, no environment, so a test can
 * sign a token with `signSession` and pass it straight in.
 */
export async function actorForToken(
  token: string | undefined,
  secret: string,
  now: Date = new Date()
): Promise<Identity | null> {
  if (!token) return null;
  const result = await verifySession(token, secret, now);
  if (!result.ok) return null;

  const [customers, staff] = await Promise.all([loadCustomers(), loadStaff()]);
  return findIdentity(customers, staff, result.payload.sub) ?? null;
}

/**
 * The identity behind the current request's session cookie. Works the same way in a
 * Route Handler and in a Server Component page: both can read cookies this way.
 */
export async function getActor(): Promise<Identity | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return actorForToken(token, sessionSecret());
}

/** Like `getActor`, but throws a 401 ApiError when nobody is logged in. */
export async function requireActor(): Promise<Identity> {
  const actor = await getActor();
  if (!actor) throw new ApiError(401, 'NOT_LOGGED_IN', 'Log in to continue.');
  return actor;
}

/** Requires a logged-in actor whose role has `permission`; throws a 401 or a 403. */
export async function requireRole(permission: Permission): Promise<Identity> {
  const actor = await requireActor();
  if (!can(actor.role, permission)) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this.');
  }
  return actor;
}

/**
 * Like `requireRole`, but also hands back the customer record. Only customers can hold a
 * client permission, so the 403 here is a safeguard for a permission granted to staff later.
 */
export async function requireCustomer(permission: Permission): Promise<Customer> {
  const actor = await requireRole(permission);
  if (actor.kind !== 'customer') {
    throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to do this.');
  }
  return actor.customer;
}
