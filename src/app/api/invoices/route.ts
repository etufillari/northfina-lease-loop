// GET /api/invoices?contractId=…
// A contract's invoices in sequence order. Only the contract's customer or admin may read them
// (D73, D74).
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok } from '@/server/api-response';
import { authorize, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { listInvoices } from '@/server/invoices';
import { listInvoicesQuerySchema } from '@/server/routes';

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const { contractId } = listInvoicesQuerySchema.parse({
    contractId: searchParams.get('contractId') ?? undefined,
  });

  const auth = await authorize(db, await readActor(db), 'read_contract', { contract: contractId });
  if (!auth.ok) {
    return refusalResponse(auth.reason, () => fail(404, 'CONTRACT_NOT_FOUND', 'No such contract'));
  }
  return ok(await listInvoices(db, contractId));
});
