// GET /api/assets/:id/quote?term=36&down=0&on=2026-11-05
// `term` is in months, `down` in cents (default 0), and `on` is the quote date (default: the
// date the app runs on). `on` only previews a price; applications never take a date from here.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { actingCustomerId } from '@/domain/identity';
import { fail, handleRoute, ok } from '@/server/api-response';
import { getActor } from '@/server/auth/actor';
import { currentDate } from '@/server/date/app-date';
import { db } from '@/server/db';
import { quoteAsset } from '@/server/pricing/quotes';

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

    const actor = await getActor();

    const result = await quoteAsset(db, {
      customerId: actor ? actingCustomerId(actor) : undefined,
      assetId: id,
      date: query.on ?? (await currentDate(db)),
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
      down_payment_limits: result.down_payment_limits ?? null,
    });
  }
);
