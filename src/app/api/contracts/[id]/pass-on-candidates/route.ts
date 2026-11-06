// GET /api/contracts/:id/pass-on-candidates
// Who the owner can pass the item on to: people waiting for this kind of item. Owner only.
import { fail, handleRoute, ok } from '@/server/api-response';
import { requireCustomer } from '@/server/auth/actor';
import { db } from '@/server/db';
import { listPassOnCandidates } from '@/server/end-of-term/contract-end';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]/pass-on-candidates'>) => {
    const customer = await requireCustomer('contract.end_term');
    const { id } = await params;

    const result = await listPassOnCandidates(db, { contractId: id, customer });
    if (result.ok) return ok(result.candidates);
    return result.reason === 'contract_not_found'
      ? fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`)
      : fail(409, 'CONTRACT_ALREADY_ENDED', 'This contract has already ended');
  }
);
