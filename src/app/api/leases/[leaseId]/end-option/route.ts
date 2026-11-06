import { z } from 'zod';
import { handleRoute, readJsonBody } from '@/server/api-response';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
import { respondEngineOperation } from '@/server/lease-engine/http';
import { selectEndOption } from '@/server/circular/end-options';
import { db } from '@/server/db';
const schema = z.strictObject({
  option: z.enum(['RETURN', 'PASS_ON', 'BUYOUT', 'EARLY_RETURN']),
  elapsedMonths: z.number().int().optional(),
});
export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[leaseId]/end-option'>) => {
    const { leaseId } = await params;
    const actor = await demoLeasePrincipal(request, leaseId);
    const input = await readJsonBody(request, schema);
    return respondEngineOperation(() =>
      selectEndOption(
        db,
        { actor: actor.actorId, idempotencyKey: `end:${leaseId}` },
        { leaseId, ...input }
      )
    );
  }
);
