// Who is signed in: THE one place the app learns it. Pages and API routes call
// `currentUser()`; nothing else reads a cookie or trusts an id the browser sends.
//
// The demo has no passwords: the persona picked in the demo bar is a cookie, read here on the
// server. A real login replaces only the body of `currentUser()` — read the session, look up
// the user, set `isStaff` from their role — and everything else keeps working.
import { cookies } from 'next/headers';
import { PERSONA_COOKIE, STAFF_PERSONA } from '@/components/persona-cookie';
import { fail } from './api-response';
import { db } from './db';
import { demoMode } from './demo-mode';

export type CurrentUser = {
  /** Who the audit log names for what this user does. */
  actorId: string;
  /** The customer this user is; null for staff. */
  customerId: string | null;
  /** Northfina staff: may do desk work (reviews, second-life desk, holds, item records). */
  isStaff: boolean;
  name: string | null;
};

/** The demo's one staff member. A real login has one id per staff member. */
export const DEMO_STAFF_ID = STAFF_PERSONA;

/** The signed-in user, or null when nobody is. */
export async function currentUser(): Promise<CurrentUser | null> {
  // Without demo mode there is no persona picker: a real login goes here.
  if (!demoMode()) return null;
  const persona = (await cookies()).get(PERSONA_COOKIE)?.value;
  if (!persona) return null;
  if (persona === DEMO_STAFF_ID) {
    return { actorId: DEMO_STAFF_ID, customerId: null, isStaff: true, name: null };
  }
  const customer = await db.customer.findUnique({
    where: { id: persona },
    select: { id: true, name: true },
  });
  return customer
    ? { actorId: customer.id, customerId: customer.id, isStaff: false, name: customer.name }
    : null;
}

/** For API routes: the user, or a 401 envelope to return when nobody is signed in. */
export async function requireUser(): Promise<CurrentUser | Response> {
  return (await currentUser()) ?? fail(401, 'NOT_SIGNED_IN', 'Choose who you are first');
}

/** A signed-in customer (with their customer id), or a 401/403 envelope. */
export async function requireCustomer(): Promise<
  (CurrentUser & { customerId: string }) | Response
> {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return user.customerId === null
    ? fail(403, 'CUSTOMERS_ONLY', 'This is for customers')
    : (user as CurrentUser & { customerId: string });
}

/** A signed-in staff member, or a 401/403 envelope. */
export async function requireStaff(): Promise<CurrentUser | Response> {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return user.isStaff ? user : fail(403, 'STAFF_ONLY', 'This is for Northfina staff only');
}
