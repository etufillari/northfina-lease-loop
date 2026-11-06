// POST /api/second-life/:id/execute  [?asOf=]  (staff)
// Carries out the desk's decision in one audited transaction. The decision is recomputed on
// the server; who pressed the button is the signed-in staff member.
import { handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { executeSecondLife } from '@/server/second-life';
import { secondLifeFailure } from '../failure';
import { requireStaff } from '@/server/current-user';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/second-life/[id]/execute'>) => {
    const { id } = await params;
    const user = await requireStaff();
    if (user instanceof Response) return user;
    const result = await executeSecondLife(db, {
      assetId: id,
      actor: user.actorId,
      asOf: await asOfFrom(request),
    });
    if (!result.ok) return secondLifeFailure(result.reason, id);
    return ok({
      applied: result.applied,
      winnerId: result.preview.decision.winnerId,
      co2AvoidedKg: result.co2AvoidedKg,
    });
  }
);
