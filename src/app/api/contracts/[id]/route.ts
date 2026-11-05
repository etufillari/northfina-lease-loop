// GET /api/contracts/:id   The locked contract, its invoice schedule and how it ended (or null).
import { invoiceSchedule } from '@/domain/invoicing';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getContractEnding } from '@/server/contract-endings';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { loadVatRates } from '@/data/load';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const found = /^\d+$/.test(id) ? await getContract(db, Number(id)) : null;
    if (!found) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);

    const schedule = invoiceSchedule(found.contract, await loadVatRates());
    const ending = await getContractEnding(db, found.id);
    return ok({ ...found, schedule, ending });
  }
);
