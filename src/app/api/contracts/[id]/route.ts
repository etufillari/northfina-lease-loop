// GET /api/contracts/:id   The locked contract and its invoice schedule.
import { invoiceSchedule } from '@/domain/invoicing';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { loadVatRates } from '@/data/load';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[id]'>) => {
    const { id } = await params;
    const found = /^\d+$/.test(id) ? await getContract(db, Number(id)) : null;
    if (!found) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);

    const schedule = invoiceSchedule(found.contract, await loadVatRates());
    return ok({ ...found, schedule });
  }
);
