// POST /api/second-life/:id/inspect  body: { condition }  [?asOf=]  (staff)
// The return inspection: staff grade the condition of an item back from a lease, before the
// desk decides on it. As it went out or worse, never better (src/server/inspection.ts).
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { requireStaff } from '@/server/current-user';
import { db } from '@/server/db';
import { inspectReturn } from '@/server/inspection';

const bodySchema = z.strictObject({ condition: assetConditionSchema });

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'ASSET_NOT_FOUND', 'No such asset'],
  not_returned: [409, 'ASSET_NOT_RETURNED', 'Only a returned item is inspected'],
  no_return: [409, 'NO_RETURN', 'This item has no recorded return to inspect'],
  better_than_out: [
    422,
    'BETTER_THAN_OUT',
    'An inspection cannot grade an item better than it went out',
  ],
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/second-life/[id]/inspect'>) => {
    const { id } = await params;
    const user = await requireStaff();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await inspectReturn(db, {
      assetId: id,
      condition: body.condition,
      actor: user.actorId,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok({ condition: result.condition });
  }
);
