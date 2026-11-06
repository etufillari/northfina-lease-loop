import { respondEngineOperation } from '@/server/lease-engine/http';
import { ApiError, handleRoute } from '@/server/api-response';
import { db } from '@/server/db';
import { demoCustomer } from '@/server/lease-engine/demo-access';
import { activateExistingContract } from '@/server/lease-engine/real-contract';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/activate'>) => {
    const customer = await demoCustomer(request);
    const { id } = await params;
    const contract = await db.contract.findUnique({ where: { id } });
    if (!contract) throw new ApiError(404, 'NOT_FOUND', 'Contract not found');
    if (contract.customer_id !== customer.id)
      throw new ApiError(403, 'FORBIDDEN', 'Contract belongs to another customer');
    return respondEngineOperation(() =>
      activateExistingContract(
        db,
        { actor: `demo:${customer.id}`, idempotencyKey: `activate:${id}` },
        id
      )
    );
  }
);
