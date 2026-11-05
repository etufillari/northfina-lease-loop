// POST /api/quotes   body: { assetId, termMonths, downPaymentCents }
// Prices the lease on the server for the effective today (D-030) and stores the quote with every
// amount it shows, with an audit row in the same transaction. Signing uses this quote (D-034).
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfDate } from '@/server/as-of';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { createQuote, type CreateQuoteRefusal } from '@/server/quotes';

const bodySchema = z.strictObject({
  assetId: z.string().trim().min(1).max(100),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
});

// Every refusal has a status here (the compiler checks), and a message in the UI (D-038).
const statusFor = {
  asset_not_found: 404,
  asset_not_available: 409,
  unknown_asset: 404,
  below_minimum: 422,
  above_maximum: 422,
  unknown_term: 422,
  down_payment_negative: 422,
  down_payment_off_step: 422,
  down_payment_too_large: 422,
  no_price_list_on_date: 422,
} satisfies Record<CreateQuoteRefusal, number>;

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  // No login in the starter: whoever asks for the quote is the customer.
  const result = await createQuote(db, await loadLeaseDataPack(), {
    ...body,
    today: await asOfDate(),
    actor: 'customer',
  });
  if (!result.ok) {
    return fail(statusFor[result.reason], result.reason.toUpperCase(), 'No quote was made');
  }
  return ok({ id: result.id, quote: result.quote }, { status: 201 });
});
