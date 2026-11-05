// GET /api/contracts/:id   The locked contract, its invoices and how it ended (or null). After an
// ending, `schedule` holds only the invoices issued before it took effect (D-033).
import { billedBefore, invoiceSchedule } from '@/domain/invoicing';
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

    const fullSchedule = invoiceSchedule(found.contract, await loadVatRates());
    const ending = await getContractEnding(db, found.id);
    const schedule = fullSchedule.ok
      ? { ok: true as const, ...billedBefore(fullSchedule, ending?.effectiveDate ?? null) }
      : fullSchedule;
    return ok({ ...found, schedule, ending });
  }
);
