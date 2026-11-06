// PATCH /api/assets/:id/status   body: { "status": "reserved" }  (staff only)
// Changes the status and writes an audit row in the same transaction.
// The audit log names the signed-in staff member (src/server/current-user.ts).
import { z } from 'zod';
import { assetStatusSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { db } from '@/server/db';
import { requireStaff } from '@/server/current-user';

const bodySchema = z.strictObject({
  status: assetStatusSchema,
});

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = await params;
    const user = await requireStaff();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);

    const result = await changeAssetStatus(db, { id, status: body.status, actor: user.actorId });
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    return ok(result.asset);
  }
);
