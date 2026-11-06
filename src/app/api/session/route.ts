// GET    /api/session   → the current actor, or null if nobody is logged in.
// POST   /api/session   body: { "userId": "cust-aino" }  → logs in as that identity.
// DELETE /api/session   → logs out.
//
// There is no password: `userId` is any id from data/customers.json, data/staff.json or
// data/signatories.json. Identity is simulated, but the session token is a real signed
// JWT, so a route can trust the role it carries (see src/server/auth/session.ts).
import { cookies } from 'next/headers';
import { z } from 'zod';
import { loadCustomers, loadSignatories, loadStaff } from '@/data/load';
import { findIdentity, identitySummary } from '@/domain/identity';
import { sessionSecret, getActor } from '@/server/auth/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession } from '@/server/auth/session';

export const GET = handleRoute(async () => {
  const actor = await getActor();
  return ok(actor ? identitySummary(actor) : null);
});

const bodySchema = z.strictObject({ userId: z.string().min(1) });

export const POST = handleRoute(async (request) => {
  const { userId } = await readJsonBody(request, bodySchema);

  const [customers, staff, signatories] = await Promise.all([
    loadCustomers(),
    loadStaff(),
    loadSignatories(),
  ]);
  const identity = findIdentity(customers, staff, userId, signatories);
  if (!identity) return fail(404, 'USER_NOT_FOUND', `No user with id "${userId}"`);

  const token = await signSession({ sub: userId, role: identity.role }, sessionSecret());
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  return ok(identitySummary(identity));
});

export const DELETE = handleRoute(async () => {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return ok(null);
});
