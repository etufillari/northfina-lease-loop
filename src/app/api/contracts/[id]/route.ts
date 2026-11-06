import { fail, handleRoute, ok } from '@/server/api-response';
import { contractResponse, getContract } from '@/server/applications';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const contract = await getContract(db, id);
    if (!contract) return fail(404, 'CONTRACT_NOT_FOUND', 'The contract was not found');
    return ok(contractResponse(contract));
  }
);
