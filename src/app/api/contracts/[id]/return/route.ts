// POST /api/contracts/:id/return   body: { "actor": "Aino Virtanen" }
// End of term: returns the item after the lease's last day; see src/server/contracts.ts.
// There is no login, so `actor` is whatever the caller says.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { returnContract } from '@/server/end-of-term';
import { currentViewer } from '@/server/current-viewer';
import { canSee } from '@/server/viewer';
import { db } from '@/server/db';

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

const failures = {
  not_found: [404, 'NOT_FOUND', 'Contract not found'],
  not_ended: [409, 'NOT_ENDED', 'The lease has not ended yet'],
  already_decided: [409, 'ALREADY_DECIDED', 'The end of this lease has already been decided'],
  unpaid_invoices: [409, 'UNPAID_INVOICES', 'Pay the remaining invoices first'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/return'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const contract = await getContract(db, id);
    if (contract && !canSee(await currentViewer(), contract.customerId)) {
      return fail(403, 'NOT_YOURS', 'This contract belongs to another customer');
    }
    const result = await returnContract(
      db,
      { contractId: id, actor: body.actor },
      (await appDate()).today
    );
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result.contract);
  }
);
