// PATCH /api/assets/:id/status   body: { "status": "reserved" }
// Changes the status and writes an audit row in the same transaction. Who made the
// change comes from the session, not the request body: see src/server/actor.ts.
import { z } from 'zod';
import { assetStatusSchema } from '@/data/schemas';
import { identityId } from '@/domain/identity';
import { requireRole } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { db } from '@/server/db';

const bodySchema = z.strictObject({ status: assetStatusSchema });

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const actor = await requireRole('asset.change_status');
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await changeAssetStatus(db, {
      id,
      status: body.status,
      actor: identityId(actor),
    });
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    return ok(result.asset);
  }
);
