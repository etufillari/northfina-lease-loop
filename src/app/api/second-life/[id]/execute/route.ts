// POST /api/second-life/:id/execute  body: { actor }  [?asOf=]
// Carries out the desk's decision in one audited transaction. The decision is recomputed on
// the server; the body only says who pressed the button.
import { z } from 'zod';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { executeSecondLife } from '@/server/second-life';
import { secondLifeFailure } from '../failure';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/second-life/[id]/execute'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await executeSecondLife(db, {
      assetId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) return secondLifeFailure(result.reason, id);
    return ok({
      action: result.preview.decision.action,
      winnerId: result.preview.decision.winnerId,
      co2AvoidedKg: result.co2AvoidedKg,
    });
  }
);
