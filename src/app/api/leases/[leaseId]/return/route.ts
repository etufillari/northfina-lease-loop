import { getLease } from '@/server/lease-engine/leases';
import { anniversary } from '@/domain/lease-engine/calendar';
import { latestLifecycleDate } from '@/domain/circular/workflow-date';
import { z } from 'zod';
import { ApiError, handleRoute, readJsonBody } from '@/server/api-response';
import { requestReturn } from '@/server/circular/service';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
import { respondEngineOperation } from '@/server/lease-engine/http';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const schema = z.strictObject({
  usageValue: z.number().int().nonnegative().max(2_147_483_647),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[leaseId]/return'>) => {
    const { leaseId } = await params;
    const principal = await demoLeasePrincipal(request, leaseId);
    if (principal.role !== 'customer' || !principal.customerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Customer ownership is required');
    }
    const lease = await getLease(db, leaseId);
    const end = anniversary(lease.startDate, lease.termMonths);
    const requestedOn = latestLifecycleDate(
      todayIso(),
      lease.status === 'TERMINATED'
        ? (await db.engineLease.findUniqueOrThrow({ where: { id: leaseId } })).terminatedOn
        : null,
      end.ok && lease.status === 'COMPLETED' ? end.value : null
    );
    const payload = await readJsonBody(request, schema);
    const idempotencyKey = z.string().min(1).max(200).parse(request.headers.get('Idempotency-Key'));
    return respondEngineOperation(() =>
      requestReturn(
        db,
        { actor: principal.actorId, idempotencyKey },
        {
          leaseId,
          customerId: principal.customerId,
          usageValue: payload.usageValue,
          requestedOn,
        }
      )
    );
  }
);
