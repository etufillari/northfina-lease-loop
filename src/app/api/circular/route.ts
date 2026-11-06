import { z } from 'zod';
import { handleRoute, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { demoCompanyOperator } from '@/server/circular/demo-operator';
import { respondEngineOperation } from '@/server/lease-engine/http';
import {
  receiveReturn,
  inspectReturn,
  finishRefurbishment,
  reviewRefurbishment,
} from '@/server/circular/service';
import { todayIso } from '@/server/today';
const id = z.string().min(1).max(100);
const schema = z.discriminatedUnion('action', [
  z
    .strictObject({
      action: z.literal('receive'),
      assetId: id.optional(),
      leaseId: id.optional(),
      returnId: id.optional(),
      receivedOn: z.iso.date(),
    })
    .refine((value) => Boolean(value.assetId) !== Boolean(value.returnId)),
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
  z
    .strictObject({
      action: z.literal('review'),
      returnId: id,
      decision: z.enum(['APPROVE', 'REJECT']),
      reviewedOn: z.iso.date().optional(),
      reason: z.string().trim().min(1).max(500).optional(),
    })
    .refine((value) => value.decision !== 'REJECT' || Boolean(value.reason)),
]);
export const POST = handleRoute(async (request) => {
  const operator = demoCompanyOperator(request);
  const payload = await readJsonBody(request, schema);
  const context = {
    actor: operator.actorId,
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
    if (payload.action === 'finish') {
      const { action: _, ...input } = payload;
      return finishRefurbishment(db, context, input);
    }
    const { action: _, ...input } = payload;
    return reviewRefurbishment(db, context, {
      ...input,
      reviewedOn: input.reviewedOn ?? todayIso(),
    });
  });
});
