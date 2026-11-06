import { handleRoute, ok } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { cancelLeaseRequest } from '@/server/cancel-lease-request';
import { db } from '@/server/db';
export const DELETE = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[id]/requests/[requestId]'>) => {
    assertSameOrigin(request, authSettings());
    const identity = await requireIdentity(db, request.headers);
    const { id, requestId } = await params;
    await cancelLeaseRequest(db, {
      customerId: identity.customerId,
      userId: identity.id,
      contractId: id,
      requestId,
    });
    return ok({ id: requestId, status: 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
  }
);
