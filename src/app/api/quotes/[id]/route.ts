// GET /api/quotes/:id
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { loadPricingData } from '@/server/pricing-data';
import { getQuote } from '@/server/quotes';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/quotes/[id]'>) => {
  const { id } = await params;
  return ok(await getQuote(db, await loadPricingData(), id));
});
