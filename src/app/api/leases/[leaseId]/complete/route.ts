import { respondEngineOperation } from '@/server/lease-engine/http';
import { handleRoute } from '@/server/api-response';
import { db } from '@/server/db';
import { anniversary } from '@/domain/lease-engine/calendar';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
import { completeLease, getLease } from '@/server/lease-engine/leases';
import { EngineServiceError } from '@/server/lease-engine/contracts';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[leaseId]/complete'>) => {
    const { leaseId } = await params;
    const actor = await demoLeasePrincipal(request, leaseId, true);
    const lease = await getLease(db, leaseId);
    const end = anniversary(lease.startDate, lease.termMonths);
    if (!end.ok) throw new EngineServiceError('INVALID_CALCULATION');
    return respondEngineOperation(() =>
      completeLease(
        db,
        { actor: actor.actorId, idempotencyKey: `complete:${leaseId}` },
        leaseId,
        end.value,
        1
      )
    );
  }
);
