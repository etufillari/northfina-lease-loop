// POST /api/applications
// body: { "assetId": "ebike-003", "termMonths": 36, "downPaymentCents": 0, "answers": { ... } }
// The server recalculates the price and the decision; see src/server/applications.ts.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { submitApplication } from '@/server/applications';
import { db } from '@/server/db';
import { appDate } from '@/server/app-date';
import { currentViewer } from '@/server/current-viewer';
import { viewerCustomerId } from '@/server/viewer';

const submitApplicationSchema = z.strictObject({
  assetId: z.string().trim().min(1).max(50),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
  /** Question id → answer. Bounded so a request can't flood the database. */
  answers: z
    .record(z.string().regex(/^q_[a-z0-9_]+$/), z.string().max(500))
    .refine((answers) => Object.keys(answers).length <= 50, 'too many answers'),
});

const failures = {
  asset_not_found: [404, 'NOT_FOUND', 'Asset not found'],
  asset_not_available: [409, 'ASSET_NOT_AVAILABLE', 'This item cannot be leased right now'],
  cannot_quote: [422, 'CANNOT_QUOTE', 'This term and down payment cannot be priced'],
  incomplete: [422, 'INCOMPLETE', 'Some questions are still unanswered'],
} as const;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, submitApplicationSchema);
  // The applicant is whoever the viewer chose in "Acting as" (a guest when none).
  const customerId = viewerCustomerId(await currentViewer());
  const result = await submitApplication(db, { ...body, customerId }, (await appDate()).today);
  if (!result.ok) {
    const [status, code, message] = failures[result.reason];
    return fail(status, code, message);
  }
  return ok(result.application, { status: 201 });
});
