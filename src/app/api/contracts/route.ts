// POST /api/contracts
//   body: { quoteId, customerId?, answers, priceChoice?, shownMonthlyNetRentCents }
// Signs a stored quote (D-034): checks today's price first (D-014), decides the application again,
// locks the contract and reserves the asset, with an audit row in the same transaction. When
// today's rent is lower, answers 409 PRICE_CHOICE_REQUIRED with the offer and signs nothing.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { signLease } from '@/server/contracts';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { asOfDate } from '@/server/as-of';

const answerSchema = z.union([
  z.string().max(500),
  z.number(),
  z.array(z.string().max(200)).max(20),
]);

const bodySchema = z.strictObject({
  quoteId: z.number().int().positive(),
  /** A data-pack persona, when the demo filled the form as one. */
  customerId: z.string().trim().min(1).max(100).optional(),
  /** Only when today's rent is lower than the quote's: which one the customer chose. */
  priceChoice: z.enum(['keep_quote', 'todays_price']).optional(),
  /** The monthly rent excl. VAT next to the button the customer pressed. */
  shownMonthlyNetRentCents: z.number().int().positive(),
  /** Application answers by question id; decided again on the server. */
  answers: z.record(z.string().regex(/^q_[a-z0-9_]+$/), answerSchema),
});

const statusFor: Record<string, number> = {
  quote_not_found: 404,
  quote_already_used: 409,
  quote_expired: 410,
  signed_before_quote: 409,
  price_choice_required: 409,
  price_changed: 409,
  asset_not_found: 404,
  unknown_customer: 404,
  asset_not_available: 409,
  application_declined: 403,
  application_needs_review: 403,
  signatory_must_sign: 403,
  answers_do_not_match_customer: 422,
};

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const { customerId, priceChoice, ...rest } = body;
  // No login in the starter: the applicant signs for themselves.
  const result = await signLease(db, await loadLeaseDataPack(), {
    ...rest,
    ...(customerId === undefined ? {} : { customerId }),
    ...(priceChoice === undefined ? {} : { priceChoice }),
    today: await asOfDate(),
    actor: customerId ?? String(body.answers.q_email ?? 'applicant'),
  });
  if (!result.ok) {
    const { ok: _ok, reason, ...details } = result;
    return fail(
      statusFor[reason] ?? 422,
      reason.toUpperCase(),
      'The lease cannot be signed',
      // Which answers differ from the customer's record, or today's cheaper offer.
      Object.keys(details).length > 0 ? details : undefined
    );
  }
  return ok({ id: result.id, contract: result.contract, quoteId: result.quoteId }, { status: 201 });
});
