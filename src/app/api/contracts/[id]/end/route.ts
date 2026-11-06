// POST /api/contracts/:id/end
// body: { "outcome": "bought_out" | "returned" | "passed_on", "passed_to"?: "cust-wait-01" }
// The customer's choice at the end of the lease, from the planned end for 7 days. Passing an
// item on names who it goes to, and it is held for them.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { requireCustomer } from '@/server/auth/actor';
import { db } from '@/server/db';
import { endContract } from '@/server/end-of-term/contract-end';

const bodySchema = z.strictObject({
  outcome: z.enum(['bought_out', 'returned', 'passed_on']),
  passed_to: z.string().trim().min(1).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/end'>) => {
    const customer = await requireCustomer('contract.end_term');
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await endContract(db, {
      contractId: id,
      customer,
      outcome: body.outcome,
      passedTo: body.passed_to,
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
      case 'invalid_pass_on_target':
        return fail(422, 'INVALID_PASS_ON_TARGET', 'This item cannot be passed on to them');
    }
  }
);
