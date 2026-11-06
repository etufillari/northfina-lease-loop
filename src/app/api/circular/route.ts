import { z } from 'zod';
import { handleRoute, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { demoCustomer } from '@/server/lease-engine/demo-access';
import { respondEngineOperation } from '@/server/lease-engine/http';
import { receiveReturn, inspectReturn, finishRefurbishment } from '@/server/circular/service';
const id = z.string().min(1).max(100);
const schema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('receive'),
    assetId: id,
    leaseId: id.optional(),
    receivedOn: z.iso.date(),
  }),
  z.strictObject({
    action: z.literal('inspect'),
    returnId: id,
    condition: z.string(),
    usageValue: z.number(),
    target: z.enum(['good', 'like_new']).optional(),
  }),
  z.strictObject({
    action: z.literal('finish'),
    returnId: id,
    completedWorkIds: z.array(id),
    completedOn: z.iso.date(),
  }),
]);
export const POST = handleRoute(async (request) => {
  const operator = await demoCustomer(request);
  const payload = await readJsonBody(request, schema);
  const context = {
    actor: `demo-operator:${operator.id}`,
    idempotencyKey: id.parse(request.headers.get('Idempotency-Key')),
  };
  return respondEngineOperation(async () => {
    if (payload.action === 'receive') {
      const { action: _, ...input } = payload;
      return receiveReturn(db, context, input);
    }
    if (payload.action === 'inspect') {
      const { action: _, ...input } = payload;
      return inspectReturn(db, context, input);
    }
    const { action: _, ...input } = payload;
    return finishRefurbishment(db, context, input);
  });
});
