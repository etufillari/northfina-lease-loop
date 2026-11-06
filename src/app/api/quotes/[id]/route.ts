// GET /api/quotes/:id
// The stored quote from its frozen numbers (never re-priced) and where it stands today (card 2).
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { getQuote, loadPricingData, storedQuoteStatusOn } from '@/server/quotes';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/quotes/[id]'>) => {
  const { id } = await params;
  const quote = await getQuote(db, id);
  if (!quote) return fail(404, 'QUOTE_NOT_FOUND', `No quote with id "${id}"`);

  const today = await todayForRequest();
  const { priceLists } = await loadPricingData();
  return ok({ ...quote, statusToday: storedQuoteStatusOn(quote, today, priceLists) });
});
