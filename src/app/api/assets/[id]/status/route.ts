// PATCH /api/assets/:id/status   body: { "status": "reserved" }
// Changes the status and writes an audit row in the same transaction. Who made the
// change comes from the session, not the request body: see src/server/auth/actor.ts.
// A leased or sold asset is refused with a 409: only contracts move it.
import { z } from 'zod';
import { assetStatusSchema } from '@/data/schemas';
import { identityId } from '@/domain/identity';
import { requireRole } from '@/server/auth/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets/assets';
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
    if (result.ok) return ok(result.asset);
    if (result.reason === 'status_locked') {
      return fail(409, 'ASSET_STATUS_LOCKED', 'Only a contract can change this status');
    }
    return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
  }
);
