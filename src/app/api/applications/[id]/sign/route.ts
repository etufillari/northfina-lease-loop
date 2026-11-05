// POST /api/applications/:id/sign  body: { startDate, actor }
// "Verify identity electronically" — the happy-path signature. Locks the contract, creates
// the full invoice schedule and flips the asset to leased, in one audited transaction.
// For awaiting_signature applications the actor is the signatory (from the staff panel).
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { signApplication } from '@/server/contracts';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  startDate: isoDateSchema,
  actor: z.string().trim().min(1).max(100),
});

const failures: Record<string, [number, string, string]> = {
  not_found: [404, 'APPLICATION_NOT_FOUND', 'No such application'],
  not_signable: [409, 'NOT_SIGNABLE', 'Only an approved application can be signed'],
  hold_expired: [409, 'HOLD_EXPIRED', 'The 7-day hold on this approval has run out'],
  quote_expired: [409, 'QUOTE_EXPIRED', 'The quoted price is no longer valid'],
  start_before_signing: [422, 'BAD_START_DATE', 'The lease cannot start before signing'],
  start_too_far_ahead: [422, 'BAD_START_DATE', 'The lease can start at most 3 months ahead'],
  no_vat_rate_on_date: [422, 'NO_VAT_RATE', 'No VAT rate is known for this date'],
  unpriceable_amount: [422, 'NOT_PRICEABLE', 'This amount can no longer be priced'],
};

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/applications/[id]/sign'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await signApplication(db, {
      applicationId: id,
      startDate: body.startDate,
      actor: body.actor,
      asOf: asOfFrom(request),
    });
    if (!result.ok) {
      const [status, code, message] = failures[result.reason]!;
      return fail(status, code, message);
    }
    return ok({ contractId: result.contractId }, { status: 201 });
  }
);
