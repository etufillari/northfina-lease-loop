// GET /api/assets/:id/quote?term=36&down=0&on=2026-11-05
// `term` is in months, `down` in cents (default 0), `on` is the quote date (default today).
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { quoteAsset } from '@/server/quotes';
import { todayIso } from '@/server/today';

const querySchema = z.strictObject({
  term: z.coerce.number().int().positive(),
  down: z.coerce.number().int().nonnegative().default(0),
  on: isoDateSchema.optional(),
});

export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/quote'>) => {
    const { id } = await params;
    const searchParams = new URL(request.url).searchParams;
    const query = querySchema.parse(Object.fromEntries(searchParams));

    const result = await quoteAsset(db, {
      assetId: id,
      date: query.on ?? todayIso(),
      termMonths: query.term,
      downPaymentCents: query.down,
    });

    if (result.ok) return ok(result.quote);
    if (result.reason === 'asset_not_found') {
      return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);
    }
    if (result.reason === 'asset_not_available') {
      return fail(409, 'ASSET_NOT_AVAILABLE', 'This item cannot be leased right now');
    }
    return fail(422, 'QUOTE_NOT_AVAILABLE', 'This deal cannot be priced', {
      reason: result.reason,
    });
  }
);
