// POST /api/assets/:id/refurbishment/quote: calculate refurbishment without changing data.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { quoteRefurbishment, refurbishmentQuoteRequestSchema } from '@/server/refurbishment';
import { throwRefurbishmentError } from '@/server/refurbishment-errors';

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/refurbishment/quote'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, refurbishmentQuoteRequestSchema);
    const result = await quoteRefurbishment(db, id, body);
    if (!result.ok) throwRefurbishmentError(result);

    return ok({ asset: result.asset, quote: result.quote });
  }
);
