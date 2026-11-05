// POST /api/contracts/:id/return   body: { "actor": "Aino Virtanen" }
// End of term: returns the item after the lease's last day; see src/server/contracts.ts.
// There is no login, so `actor` is whatever the caller says.
import { z } from 'zod';
import { appDate } from '@/server/app-date';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { returnContract } from '@/server/contracts';
import { db } from '@/server/db';

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

const failures = {
  not_found: [404, 'NOT_FOUND', 'Contract not found'],
  not_ended: [409, 'NOT_ENDED', 'The lease has not ended yet'],
  already_returned: [409, 'ALREADY_RETURNED', 'The item has already been returned'],
} as const;

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/return'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
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
