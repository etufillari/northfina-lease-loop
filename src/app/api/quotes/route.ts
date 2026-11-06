// POST /api/quotes   body: { "assetId": "ebike-003", "termMonths": 36, "downPaymentCents": 0 }
// Prices on the request's day (the demo clock, never a date from the body) and stores the quote.
import { readActor } from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { createQuote, loadPricingData, storedQuoteStatusOn } from '@/server/quotes';
import { createQuoteBodySchema } from '@/server/quote-schemas';

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, createQuoteBodySchema);
  const today = await todayForRequest();
  const actor = await readActor(db);
  const data = await loadPricingData();

  const result = await createQuote(db, { ...body, today, actor }, data);
  if (!result.ok) {
    const status = result.reason.code === 'unknown_asset' ? 404 : 422;
    return fail(status, 'QUOTE_REFUSED', 'The quote cannot be made', result.reason);
  }
  return ok(
    { ...result.quote, statusToday: storedQuoteStatusOn(result.quote, today, data.priceLists) },
    { status: 201 }
  );
});
