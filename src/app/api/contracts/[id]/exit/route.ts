// POST /api/contracts/:id/exit   body: { "choice": "buy" | "return", "actor": "Aino Virtanen" }
// Ends a running lease early (a DEMO payment: no money moves). See src/server/early-exit.ts
// and the formula in src/domain/early-exit.ts.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { currentViewer } from '@/server/current-viewer';
import { db } from '@/server/db';
import { exitEarly } from '@/server/early-exit';
import { canSee } from '@/server/viewer';

const bodySchema = z.strictObject({
  choice: z.enum(['buy', 'return']),
  actor: z.string().trim().min(1).max(100),
});

const failures = {
  later_history: [
    409,
    'LATER_HISTORY',
    'This item has later history: travel forward to its present to change it',
  ],
  not_found: [404, 'NOT_FOUND', 'Contract not found'],
  not_running: [409, 'NOT_RUNNING', 'Only a running lease can be ended early'],
  cannot_price: [422, 'CANNOT_PRICE', 'The early exit cannot be priced today'],
  unpaid_invoices: [409, 'UNPAID_INVOICES', 'Pay the open invoices first'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/exit'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const contract = await getContract(db, id);
    if (contract && !canSee(await currentViewer(), contract.customerId)) {
      return fail(403, 'NOT_YOURS', 'This contract belongs to another customer');
    }
    const result = await exitEarly(db, { contractId: id, ...body }, (await appDate()).today);
    if (!result.ok) {
      const [status, code, message] = failures[result.reason];
      return fail(status, code, message);
    }
    return ok(result);
  }
);
