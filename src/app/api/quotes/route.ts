// POST /api/quotes   body: { assetId, termMonths, downPaymentCents }
// Prices the lease on the server for the effective today (D-030) and stores the quote with every
// amount it shows, with an audit row in the same transaction. Signing uses this quote (D-034).
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { asOfDate } from '@/server/as-of';
import { db } from '@/server/db';
import { loadLeaseDataPack } from '@/server/lease-data';
import { createQuote } from '@/server/quotes';

const bodySchema = z.strictObject({
  assetId: z.string().trim().min(1).max(100),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
});

const statusFor: Record<string, number> = {
  asset_not_found: 404,
  asset_not_available: 409,
};

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  // No login in the starter: whoever asks for the quote is the customer.
  const result = await createQuote(db, await loadLeaseDataPack(), {
    ...body,
    today: await asOfDate(),
    actor: 'customer',
  });
  if (!result.ok) {
    return fail(statusFor[result.reason] ?? 422, result.reason.toUpperCase(), 'No quote was made');
  }
  return ok({ id: result.id, quote: result.quote }, { status: 201 });
});
