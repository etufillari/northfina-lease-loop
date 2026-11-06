// PATCH /api/assets/:id/status   body: { "status": "reserved" }
// The admin's manual status change: the actor comes from the actor cookie (D17), only `admin`
// may make it, authorized first (D73, D74), and it must be one of D22's transitions. Status
// and audit row in one transaction.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { authorize, forbiddenResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { assetIdParamsSchema, changeAssetStatusBodySchema } from '@/server/routes';

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = assetIdParamsSchema.parse(await params);
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'set_asset_status', { none: true });
    if (!auth.ok && auth.reason.code !== 'not_found') return forbiddenResponse(auth.reason);
    const body = await readJsonBody(request, changeAssetStatusBodySchema);

    const result = await changeAssetStatus(db, { id, status: body.status, actor });
    if (result.ok) return ok(result.asset);
    if (result.reason === 'not_found') return fail(404, 'ASSET_NOT_FOUND', 'No asset with that id');
    if (result.reason === 'forbidden') return forbiddenResponse(result.refusal);
    return fail(
      409,
      'ASSET_STATUS_TRANSITION_NOT_ALLOWED',
      'That status change is not allowed',
      result.reason
    );
  }
);
