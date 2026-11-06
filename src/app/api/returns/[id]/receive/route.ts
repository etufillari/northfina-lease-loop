import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { receiveReturn } from '@/server/returns';

const bodySchema = z.strictObject({
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative(),
  usageSinceLastService: z.number().int().nonnegative().optional(),
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[id]/receive'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await receiveReturn(db, id, body);

    return ok({
      returnRequest: result,
      assetStatusChanged: false,
    });
  }
);
