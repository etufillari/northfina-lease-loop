// GET /api/contracts/:id
// A contract with its frozen price, its quote day and, when today's list is another version,
// why the price holds (card 2). Only the contract's customer or admin may read it (D73, D74).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { getContractDetails } from '@/server/contracts';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

const notFound = () => fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const auth = await authorize(db, await readActor(db), 'read_contract', { contract: id });
    if (!auth.ok) return refusalResponse(auth.reason, notFound);

    const details = await getContractDetails(db, id, await todayForRequest());
    return details ? ok(details) : notFound();
  }
);
