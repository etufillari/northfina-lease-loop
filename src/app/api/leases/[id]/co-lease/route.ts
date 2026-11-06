import { handleRoute, ok } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { coLeaseInputSchema, saveCoLeaseShares } from '@/server/co-lease';
import { db } from '@/server/db';
import { requestToday } from '@/server/demo-mode';
import { readRecoveryBody } from '@/server/recovery-input';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[id]/co-lease'>) => {
    assertSameOrigin(request, authSettings());
    const identity = await requireIdentity(db, request.headers);
    const { id } = await params;
    const { shares } = await readRecoveryBody(request, coLeaseInputSchema);
    await saveCoLeaseShares(db, {
      customerId: identity.customerId,
      userId: identity.id,
      contractId: id,
      today: requestToday(request),
      shares,
    });
    return ok({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
);
