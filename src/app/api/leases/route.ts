import { handleRoute, ok } from '@/server/api-response';
import { requireIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { listCustomerLeases } from '@/server/leases';

export const GET = handleRoute(async (request) => {
  const identity = await requireIdentity(db, request.headers);
  return ok(await listCustomerLeases(db, identity.customerId), {
    headers: { 'Cache-Control': 'no-store' },
  });
});
