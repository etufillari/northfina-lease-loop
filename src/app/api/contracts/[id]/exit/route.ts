// POST /api/contracts/:id/exit
// body: { "mode": "return", "condition": "good", "usage": { "unit": "km", "value": 1800 } }
// Buys out, returns or passes on the contract on the request's day (the demo clock, never a
// date from the body): sets the status and end day, emits the event, bills the exit and
// cancels the unpaid rents, all in one audited transaction; a pass-on also stores the next
// customer's quote in it (D90). The customer or admin only,
// authorized first (D73, D74).
import { isAuthzRefusal } from '@/domain/authz/policy';
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authorize, forbiddenResponse, refusalResponse } from '@/server/authorize';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { exitBodySchema } from '@/server/exit-schemas';
import { exitContract, type ExitServiceRefusal } from '@/server/exits';

const STATUS_OF: Partial<Record<ExitServiceRefusal['code'], number>> = {
  contract_not_found: 404,
  contract_not_active: 409,
  asset_not_leased: 409,
  next_customer_not_found: 422,
};

const refused = (status: number, reason: ExitServiceRefusal) =>
  fail(status, 'EXIT_REFUSED', 'The contract cannot be ended this way', reason);

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/exit'>) => {
    const { id } = await params;
    const actor = await readActor(db);
    const auth = await authorize(db, actor, 'exit_contract', { contract: id });
    if (!auth.ok) {
      return refusalResponse(auth.reason, () =>
        refused(404, { code: 'contract_not_found', params: { contractId: id } })
      );
    }
    const body = await readJsonBody(request, exitBodySchema);
    const today = await todayForRequest();

    const { condition, usage, ...choice } = body;
    const result = await exitContract(
      db,
      { ...choice, reported: { condition, usage }, contractId: id, actor },
      today
    );
    if (!result.ok) {
      if (isAuthzRefusal(result.reason)) return forbiddenResponse(result.reason);
      return refused(STATUS_OF[result.reason.code] ?? 422, result.reason);
    }
    // D90: a pass-on answers with the next customer's new quote.
    return ok({
      contract: result.contract,
      plan: result.plan,
      ...(result.nextQuoteId ? { nextQuoteId: result.nextQuoteId } : {}),
    });
  }
);
