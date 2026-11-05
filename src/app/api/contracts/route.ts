// POST /api/contracts   body: { assetId, customerId?, termMonths, downPaymentCents, answers }
// Prices the lease again on the server (browser numbers are never trusted), locks it into a
// contract and reserves the asset, with an audit row in the same transaction.
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
  assetId: z.string().trim().min(1).max(100),
  /** A data-pack persona, when the demo filled the form as one. */
  customerId: z.string().trim().min(1).max(100).optional(),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
  /** Application answers by question id; decided again on the server. */
  answers: z.record(z.string().regex(/^q_[a-z0-9_]+$/), answerSchema),
});

const statusFor: Record<string, number> = {
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
  const { customerId, ...rest } = body;
  // No login in the starter: the applicant signs for themselves.
  const result = await signLease(db, await loadLeaseDataPack(), {
    ...rest,
    ...(customerId === undefined ? {} : { customerId }),
    today: await asOfDate(),
    actor: customerId ?? String(body.answers.q_email ?? 'applicant'),
  });
  if (!result.ok) {
    return fail(
      statusFor[result.reason] ?? 422,
      result.reason.toUpperCase(),
      'The lease cannot be signed',
      // Which answers differ from the named customer's record, so the form can point at them.
      'questionIds' in result ? { questionIds: result.questionIds } : undefined
    );
  }
  return ok({ id: result.id, contract: result.contract }, { status: 201 });
});
