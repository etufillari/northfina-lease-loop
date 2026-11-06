// POST /api/contracts/:id/end-of-term  body: { action: "buy" | "return",
//   usageReadings?: { assetId: reading } }  [?asOf=] — a return needs every item's reading.
// Buy it (buyout invoice, 30 days to pay, asset leaves the loop) or return it (the asset
// becomes `returned` and feeds the second-life desk).
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { notYours } from '@/server/authz';
import { db } from '@/server/db';
import { endOfTerm } from '@/server/lifecycle';
import { requireCustomer } from '@/server/current-user';

const bodySchema = z.strictObject({
  action: z.enum(['buy', 'return']),
  /** Asset id → the lifetime meter reading at the return (km, cycles or hours). */
  usageReadings: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[id]/end-of-term'>) => {
    const { id } = await params;
    const user = await requireCustomer();
    if (user instanceof Response) return user;
    const body = await readJsonBody(request, bodySchema);
    const result = await endOfTerm(db, {
      contractId: id,
      action: body.action,
      actor: user.actorId,
      asOf: await asOfFrom(request),
      usageReadings: body.usageReadings,
    });
    if (!result.ok) {
      if (result.reason === 'not_yours') return notYours();
      if (result.reason === 'not_found') return fail(404, 'CONTRACT_NOT_FOUND', 'No such contract');
      if (result.reason === 'nominated') {
        return fail(
          409,
          'NOMINATED',
          'A successor accepted this item: the lease runs to its end and the item is returned'
        );
      }
      if (result.reason === 'not_active')
        return fail(409, 'NOT_ACTIVE', 'This contract has already ended');
      if (result.reason === 'term_not_ended') {
        return fail(
          409,
          'TERM_NOT_ENDED',
          'The term has not ended yet; use the early exit instead'
        );
      }
      if (result.reason === 'usage_reading_missing') {
        return fail(422, 'USAGE_READING_MISSING', 'Enter the meter reading for every item');
      }
      if (result.reason === 'usage_reading_below_total') {
        return fail(422, 'USAGE_READING_TOO_LOW', 'A reading cannot be below the lifetime total');
      }
      return fail(422, 'NO_VAT_RATE', 'No VAT rate is known for this date');
    }
    return ok({ done: true });
  }
);
