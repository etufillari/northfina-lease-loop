import { z } from 'zod';
import { loadRefurbishmentCosts } from '@/data/load';
import { handleRoute, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
import { createEngineLeaseReader } from '@/server/returns/lease-reader';
import { respondReturnOperation } from '@/server/returns/http';
import { receiveAssetReturn, returnInspectionSchema } from '@/server/returns/service';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[leaseId]/return'>) =>
    respondReturnOperation(async () => {
      const { leaseId } = await params;
      const id = z.string().trim().min(1).max(100).parse(leaseId);
      const actor = await demoLeasePrincipal(request, id, true);
      const idempotencyKey = z
        .string()
        .trim()
        .min(1)
        .max(200)
        .parse(request.headers.get('Idempotency-Key'));
      const inspection = await readJsonBody(request, returnInspectionSchema);
      const costs = await loadRefurbishmentCosts();
      return receiveAssetReturn(db, createEngineLeaseReader(db), costs, {
        ...inspection,
        leaseId: id,
        idempotencyKey,
        actor: actor.actorId,
      });
    })
);
