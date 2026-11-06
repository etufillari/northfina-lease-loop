import { demoCompanyOperator } from '@/server/circular/demo-operator';
import { ApiError } from '@/server/api-response';
import { getActiveUser } from '@/server/active-user';
import { db } from '@/server/db';
import type { EnginePrincipal } from './http';

/** Existing development-only customer switcher, explicitly NOT production authentication. */
export async function demoCustomer(request: Request) {
  if (process.env.NODE_ENV !== 'development') throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const target = new URL(request.url);
  // Next may normalize request.url to localhost; compare with the actual browser Host.
  target.host = request.headers.get('host') ?? target.host;
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== target.origin
  ) {
    throw new ApiError(403, 'FORBIDDEN', 'Same-origin request required');
  }
  const customer = await getActiveUser();
  if (!customer) throw new ApiError(401, 'UNAUTHORIZED', 'Select a demo customer');
  return customer;
}

export async function demoLeasePrincipal(
  request: Request,
  leaseId: string,
  issue = false
): Promise<EnginePrincipal> {
  if (issue) return { ...demoCompanyOperator(request), role: 'operator' };
  const customer = await demoCustomer(request);
  const lease = await db.engineLease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new ApiError(404, 'NOT_FOUND', 'Lease not found');
  if (lease.customerId !== customer.id)
    throw new ApiError(403, 'FORBIDDEN', 'Lease belongs to another customer');
  return { actorId: customer.id, role: 'customer', customerId: customer.id };
}
