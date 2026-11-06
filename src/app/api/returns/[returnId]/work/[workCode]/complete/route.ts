import { z } from 'zod';
import { handleRoute, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
import { respondReturnOperation } from '@/server/returns/http';
import { completeRefurbishmentWork, completeWorkRequestSchema } from '@/server/returns/service';
import { ReturnServiceError } from '@/server/returns/types';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[returnId]/work/[workCode]/complete'>) =>
    respondReturnOperation(async () => {
      const { returnId, workCode } = await params;
      const id = z.string().trim().min(1).max(100).parse(returnId);
      const code = z.string().trim().min(1).max(200).parse(workCode);
      const receipt = await db.assetReturn.findUnique({
        where: { id },
        select: { leaseId: true },
      });
      if (!receipt) throw new ReturnServiceError('NOT_FOUND');
      const actor = await demoLeasePrincipal(request, receipt.leaseId, true);
      const input = await readJsonBody(request, completeWorkRequestSchema);
      return completeRefurbishmentWork(db, id, code, {
        ...input,
        actor: actor.actorId,
      });
    })
);
