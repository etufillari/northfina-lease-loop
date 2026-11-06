// Who is acting (docs/decisions.md D17). There is no login: the "continue as" picker sets a
// cookie with a customer id or `admin`, and every withAudit entry names that actor. A cookie
// that names nobody we know reads as `anonymous`.
import { cookies } from 'next/headers';
import { listCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

export const ACTOR_COOKIE = 'lease-loop-actor';
export const ADMIN_ACTOR = 'admin';
export const ANONYMOUS_ACTOR = 'anonymous';

/** A customer id, `admin` or `anonymous`. */
export type Actor = string;

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The actor a cookie value names: the value itself when it is `admin` or one of `knownIds`,
 * otherwise `anonymous`. Exact match only: no trimming, no case folding.
 */
export function actorFromCookieValue(
  value: string | undefined,
  knownIds: readonly string[]
): Actor {
  if (value === ADMIN_ACTOR) return ADMIN_ACTOR;
  if (value !== undefined && value !== ANONYMOUS_ACTOR && knownIds.includes(value)) return value;
  return ANONYMOUS_ACTOR;
}

/** `Set-Cookie` value that remembers the actor for 30 days. */
export function actorCookieHeader(actor: Actor): string {
  return `${ACTOR_COOKIE}=${encodeURIComponent(actor)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`;
}

/** `Set-Cookie` value that forgets the actor. */
export function clearActorCookieHeader(): string {
  return `${ACTOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/** Checks a cookie value against the customers in the database. */
export async function resolveActor(db: PrismaClient, value: string | undefined): Promise<Actor> {
  // Through the customers slice's read (team rule 3, review finding 13).
  const customers = await listCustomers(db);
  return actorFromCookieValue(
    value,
    customers.map((customer) => customer.id)
  );
}

/** The actor of the current request. Call it in a page or a route, once, and pass it down. */
export async function readActor(db: PrismaClient): Promise<Actor> {
  const store = await cookies();
  return resolveActor(db, store.get(ACTOR_COOKIE)?.value);
}
