// PATCH /api/assets/:id/status   body: { "status": "reserved" }
// Staff-only: the audit actor always comes from the verified session.
import { z } from 'zod';
import { assetStatusSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireStaff } from '@/server/auth-session';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  status: assetStatusSchema,
});

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const settings = authSettings();
    assertSameOrigin(request, settings);
    const identity = await requireStaff(db, request.headers, settings);
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await changeAssetStatus(db, { id, status: body.status, actor: identity.id });
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    return ok(result.asset);
  }
);
