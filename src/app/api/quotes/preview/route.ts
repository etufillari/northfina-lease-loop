// GET /api/quotes/preview?assetId=ebike-003&termMonths=36&downPaymentCents=0
// The live sliders: prices on the request's day without storing anything.
import { handleRoute, ok } from '@/server/api-response';
import { todayForRequest } from '@/server/demo-clock';
import { db } from '@/server/db';
import { loadPricingData, previewQuote } from '@/server/quotes';
import { pricingForAsset } from '@/server/second-life-price';
import { previewQuoteQuerySchema } from '@/server/quote-schemas';

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const query = previewQuoteQuerySchema.parse({
    assetId: searchParams.get('assetId') ?? undefined,
    termMonths: searchParams.get('termMonths') ?? undefined,
    downPaymentCents: searchParams.get('downPaymentCents') ?? undefined,
  });
  const today = await todayForRequest();
  // D12: a relisted item slides on its second-life price.
  const data = await pricingForAsset(db, query.assetId, await loadPricingData());
  return ok(previewQuote(data, { ...query, today }));
});
