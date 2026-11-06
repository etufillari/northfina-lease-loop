// POST /api/applications/preview
// body: { assetId, date, downPaymentCents, termMonths, answers? }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import {
  applicationPreviewRequestSchema,
  createApplicationPreview,
} from '@/server/applications/applications';
import { throwQuoteError } from '@/server/quotes/quote-errors';

export const POST = handleRoute(async (request) => {
  const input = await readJsonBody(request, applicationPreviewRequestSchema);
  const result = await createApplicationPreview(db, input);
  if (!result.ok) throwQuoteError(result);
  return ok(result.preview);
});
