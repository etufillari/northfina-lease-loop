// POST /api/contracts/:id/end   body: { "outcome": "bought_out" | "returned" | "passed_on" }
// The customer's choice at the end of the lease, from the planned end for 7 days.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { requireCustomer } from '@/server/auth/actor';
import { db } from '@/server/db';
import { endContract } from '@/server/end-of-term/contract-end';

const bodySchema = z.strictObject({ outcome: z.enum(['bought_out', 'returned', 'passed_on']) });

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/end'>) => {
    const customer = await requireCustomer('contract.end_term');
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await endContract(db, {
      contractId: id,
      customer,
      outcome: body.outcome,
    });
    if (result.ok) return ok(result.contract);

    switch (result.reason) {
      case 'contract_not_found':
        return fail(404, 'CONTRACT_NOT_FOUND', `No contract with id "${id}"`);
      case 'already_ended':
        return fail(409, 'CONTRACT_ALREADY_ENDED', 'This contract has already ended');
      case 'not_due':
        return fail(409, 'CONTRACT_NOT_DUE', 'This contract has not reached its end yet');
      case 'window_closed':
        return fail(409, 'CHOICE_WINDOW_CLOSED', 'The time to choose has passed');
    }
  }
);
