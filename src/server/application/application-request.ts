// What the application routes accept and how their failures are answered, in one place so the
// questions route and the submit route cannot drift apart. Note what is NOT here: a date, a
// price or a customer. The server takes those from its own clock, the data and the session.
import { z } from 'zod';
import { answersSchema } from '@/data/lease-schemas';
import { fail } from '../api-response';
import type { SubmitResult } from './applications';

export const applicationRequestSchema = z.strictObject({
  asset_id: z.string().trim().min(1),
  term_months: z.number().int().positive(),
  down_payment_cents: z.number().int().nonnegative().default(0),
  answers: answersSchema.default({}),
});

type Failure = Extract<SubmitResult, { ok: false }>;

/** The error response for a request that could not become (or describe) an application. */
export function failureResponse(failure: Failure, assetId: string): Response {
  switch (failure.reason) {
    case 'asset_not_found':
      return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${assetId}"`);
    case 'asset_not_available':
      return fail(409, 'ASSET_NOT_AVAILABLE', 'This item cannot be leased right now');
    case 'answers_invalid':
      return fail(422, 'ANSWERS_INVALID', 'Some answers are not valid', {
        errors: failure.errors,
      });
    case 'answers_missing':
      return fail(422, 'ANSWERS_MISSING', 'Some questions have no answer yet', {
        question_ids: failure.question_ids,
      });
    default:
      return fail(422, 'QUOTE_NOT_AVAILABLE', 'This deal cannot be priced', {
        reason: failure.reason,
      });
  }
}
