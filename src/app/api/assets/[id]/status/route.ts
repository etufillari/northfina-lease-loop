// PATCH /api/assets/:id/status   body: { "status": "reserved", "actor": "team-kettu" }
// Changes the status and writes an audit row in the same transaction.
// There is no login in the starter, so `actor` is whatever the caller says.
import { z } from 'zod';
import { assetStatusSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { completeReservation } from '@/server/reservations';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  status: assetStatusSchema,
  actor: z.string().trim().min(1).max(100),
  token: z.string().trim().optional(),
});

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await changeAssetStatus(db, { id, status: body.status, actor: body.actor });
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    if (body.token) {
      await completeReservation(db, { assetId: id, token: body.token, actor: body.actor });
    }

    return ok(result.asset);
  }
);
