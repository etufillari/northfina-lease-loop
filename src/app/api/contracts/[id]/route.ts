// GET /api/contracts/:id
// The customer sees their own contract, and staff see any. Anyone else gets a 404, the same
// as for an id that does not exist, so ids cannot be probed.
import { canViewContract } from '@/domain/identity';
import { fail, handleRoute, ok } from '@/server/api-response';
import { requireActor } from '@/server/auth/actor';
import { contractViews, getContract } from '@/server/contract/contracts';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const actor = await requireActor();
    const { id } = await params;

    const contract = await getContract(db, id);
    if (!contract || !canViewContract(actor, contract.customer_id)) {
      return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);
    }

    const [view] = await contractViews(db, [contract]);
    return ok(view);
  }
);
