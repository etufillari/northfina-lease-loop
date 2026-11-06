// GET  /api/contracts/:id/early-exit  [?asOf=] — the full card-8 calculation as a preview.
// POST /api/contracts/:id/early-exit  body: { usageReadings } — confirm (the holder): end the contract, issue
// the exit invoice (30 days to pay) and return the asset.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { notYours } from '@/server/authz';
import { requireCustomer, requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { earlyExitPreview, executeEarlyExit } from '@/server/lifecycle';

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'CONTRACT_NOT_FOUND', 'No such contract'],
  nominated: [
    409,
    'NOMINATED',
    'A successor accepted this item: the lease runs to its end and the item is returned',
  ],
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
    const user = await requireUser();
    if (user instanceof Response) return user;
    // The exit price is the holder's business (and staff's).
    const contract = await db.contract.findUnique({ where: { id }, select: { customer_id: true } });
    if (contract && !user.isStaff && contract.customer_id !== user.customerId) return notYours();
    const result = await earlyExitPreview(db, id, asOfFrom(request));
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok(result.preview);
  }
);

const bodySchema = z.strictObject({
  /** Asset id → the lifetime meter reading at the return (km, cycles or hours). */
  usageReadings: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/early-exit'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await executeEarlyExit(db, {
      contractId: id,
      actor: user.actorId,
      asOf: asOfFrom(request),
      usageReadings: body.usageReadings,
    });
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok(result.preview);
  }
);
