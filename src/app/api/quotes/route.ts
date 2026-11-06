// POST /api/quotes
// body: { assetId, date, downPaymentCents, termMonths }
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { createQuote, quoteRequestSchema } from '@/server/quotes';
import { throwQuoteError } from '@/server/quote-errors';

export const POST = handleRoute(async (request) => {
  const input = await readJsonBody(request, quoteRequestSchema);
  const result = await createQuote(db, input);
  if (!result.ok) throwQuoteError(result);
  return ok(result.quote);
});
