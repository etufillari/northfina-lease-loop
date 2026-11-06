// GET  /api/contracts/:id/early-exit  [?asOf=] — the full card-8 calculation as a preview.
// POST /api/contracts/:id/early-exit  body: { actor, usageReadings } — confirm: end the contract, issue
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
  usage_reading_missing: [422, 'USAGE_READING_MISSING', 'Enter the meter reading for every item'],
  usage_reading_below_total: [
    422,
    'USAGE_READING_TOO_LOW',
    'A reading cannot be below the lifetime total',
  ],
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

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
  /** Asset id → the lifetime meter reading at the return (km, cycles or hours). */
  usageReadings: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await executeEarlyExit(db, {
      contractId: id,
      actor: body.actor,
      asOf: asOfFrom(request),
      usageReadings: body.usageReadings,
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok(result.preview);
  }
);
