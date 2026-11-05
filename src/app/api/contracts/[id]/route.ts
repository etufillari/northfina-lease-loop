// GET /api/contracts/:id — the locked contract with its invoices and assets.
import { fail, handleRoute, ok } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const contract = await getContract(db, id);
    if (!contract) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);
    return ok(contract);
  }
);
