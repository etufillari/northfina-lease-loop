// POST /api/contracts/:id/pass-on   body: { "toCustomerId": "cust-lena", "actor": "Aino Virtanen" }
// End of term: pass the item on to another customer, who is asked to accept.
// See src/server/end-of-term.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { passOnContract } from '@/server/end-of-term';
import { canSee } from '@/server/viewer';

const bodySchema = z.strictObject({
  toCustomerId: z.string().trim().min(1).max(50),
  actor: z.string().trim().min(1).max(100),
});

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
  invalid_recipient: [422, 'INVALID_RECIPIENT', 'Choose another customer to pass it on to'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/pass-on'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const contract = await getContract(db, id);
    if (contract && !canSee(await currentViewer(), contract.customerId)) {
      return fail(403, 'NOT_YOURS', 'This contract belongs to another customer');
    }
    const result = await passOnContract(db, { contractId: id, ...body }, (await appDate()).today);
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result, { status: 201 });
  }
);
