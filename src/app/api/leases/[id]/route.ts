import { fail, handleRoute, ok } from '@/server/api-response';
import { requireIdentity } from '@/server/auth-session';
import { db } from '@/server/db';
import { findCustomerLease } from '@/server/leases';

export const GET = handleRoute(async (request, { params }: RouteContext<'/api/leases/[id]'>) => {
  const identity = await requireIdentity(db, request.headers);
  const { id } = await params;
  const lease = await findCustomerLease(db, identity.customerId, id);
  return lease
    ? ok(lease, { headers: { 'Cache-Control': 'no-store' } })
    : fail(404, 'NOT_FOUND', 'Lease not found.');
});
