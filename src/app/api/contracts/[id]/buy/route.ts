// POST /api/contracts/:id/buy   body: { "actor": "Aino Virtanen" }
// End of term: buy the item for the buyout price plus today's VAT (a DEMO payment: no money
// moves). See src/server/end-of-term.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { buyContract } from '@/server/end-of-term';
import { canSee } from '@/server/viewer';

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

const failures = {
  later_history: [
    409,
    'LATER_HISTORY',
    'This item has later history: travel forward to its present to change it',
  ],
  not_found: [404, 'NOT_FOUND', 'Contract not found'],
  not_ended: [409, 'NOT_ENDED', 'The lease has not ended yet'],
  already_decided: [409, 'ALREADY_DECIDED', 'The end of this lease has already been decided'],
  unpaid_invoices: [409, 'UNPAID_INVOICES', 'Pay the remaining invoices first'],
  no_vat_rate: [422, 'NO_VAT_RATE', 'No VAT rate covers today'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/buy'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const contract = await getContract(db, id);
    if (contract && !canSee(await currentViewer(), contract.customerId)) {
      return fail(403, 'NOT_YOURS', 'This contract belongs to another customer');
    }
    const result = await buyContract(
      db,
      { contractId: id, actor: body.actor },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
