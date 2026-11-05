// GET  /api/contracts/:id/early-exit  [?asOf=] — the full card-8 calculation as a preview.
// POST /api/contracts/:id/early-exit  body: { actor } — confirm: end the contract, issue
// the exit invoice (30 days to pay) and return the asset.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { db } from '@/server/db';
import { earlyExitPreview, executeEarlyExit } from '@/server/lifecycle';

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'CONTRACT_NOT_FOUND', 'No such contract'],
  not_active: [409, 'NOT_ACTIVE', 'This contract has already ended'],
  not_started: [409, 'NOT_STARTED', 'The lease has not started yet'],
  term_already_over: [409, 'TERM_OVER', 'The term is over: use the end-of-term actions'],
  no_vat_rate_on_date: [422, 'NO_VAT_RATE', 'No VAT rate is known for this date'],
  unpriceable_amount: [422, 'NOT_PRICEABLE', 'This amount can no longer be priced'],
  bad_used_months: [422, 'BAD_MONTHS', 'No months of use to price'],
};

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit'>) => {
    const { id } = await params;
    const result = await earlyExitPreview(db, id, asOfFrom(request));
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok(result.preview);
  }
);

const bodySchema = z.strictObject({ actor: z.string().trim().min(1).max(100) });

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await executeEarlyExit(db, {
      contractId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok(result.preview);
  }
);
