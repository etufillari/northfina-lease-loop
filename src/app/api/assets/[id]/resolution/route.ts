// POST /api/assets/:id/resolution
// Resolves end-of-term lease options: buyout, return, or pass_on.
// Changes status to 'sold' (buyout) or 'returned' (return/pass_on) and logs withAudit.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { resolveAssetEndOfTerm } from '@/server/assets';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  action: z.enum(['buyout', 'return', 'pass_on']),
  actor: z.string().trim().min(1).max(100).default('customer'),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/resolution'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await resolveAssetEndOfTerm(db, {
      id,
      action: body.action,
      actor: body.actor,
      details: body.details,
    });

    if (!result.ok) {
      return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
    }

    return ok(result.asset);
  }
);
