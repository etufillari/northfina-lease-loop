// GET /api/contracts/:id   The locked contract, its invoices and how it ended (or null). After an
// ending, `schedule` holds only the invoices issued before it took effect (D-033). While the
// contract waits for a signature, `awaitingSignature` says who and `schedule` is null (D-053).
import { fail, handleRoute, ok } from '@/server/api-response';
import { getContractEnding } from '@/server/contract-endings';
import { getContract, issuedInvoices } from '@/server/contracts';
import { db } from '@/server/db';
import { loadVatRates } from '@/data/load';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const found = /^\d+$/.test(id) ? await getContract(db, Number(id)) : null;
    if (!found) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);

    const ending = await getContractEnding(db, found.id);
    const schedule = issuedInvoices(found, ending, await loadVatRates());
    return ok({ ...found, schedule, ending });
  }
);
