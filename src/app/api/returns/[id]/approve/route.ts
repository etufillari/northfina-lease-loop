import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { approveReturnPlan, approveReturnPlanSchema } from '@/server/return-completion';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/returns/[id]/approve'>) => {
    const { id } = await params;

    const body = await readJsonBody(request, approveReturnPlanSchema);

    const result = await approveReturnPlan(db, id, body);

    return ok({ returnRequest: result });
  }
);
