// GET /api/quote?assetId=ebike-003&downPaymentCents=0&termMonths=36[&quantity=1]
//                [&asOf=2026-11-05]
// Live pricing for the sliders. No write: a quote is only persisted when an application
// starts. For a signed-in customer it adds the affordability check and, when that fails, the
// "better chance of approval" suggestion — never a hard rejection before consent.
import { z } from 'zod';
import { loadCoefficientTable } from '@/data/load';
import {
  checkAffordability,
  suggestAffordableParameters,
  type AffordabilityResult,
  type AffordableSuggestion,
} from '@/domain/affordability';
import { fail, handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { currentUser } from '@/server/current-user';
import { db } from '@/server/db';
import { buildLiveQuote, secondLifePrices } from '@/server/quotes';

const paramsSchema = z.object({
  /** Comma-separated DISTINCT asset ids: one item, or a fleet priced as one banded total. */
  assetIds: z.string().min(1),
  downPaymentCents: z.coerce.number().int(),
  termMonths: z.coerce.number().int().positive(),
});

export const GET = handleRoute(async (request) => {
  const url = new URL(request.url);
  const parsed = paramsSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail(400, 'VALIDATION_ERROR', 'Bad quote parameters');
  const { assetIds, downPaymentCents, termMonths } = parsed.data;
  const customerId = (await currentUser())?.customerId ?? null;
  const asOf = asOfFrom(request);

  const ids = assetIds.split(',').filter(Boolean);
  const live = await buildLiveQuote({
    assetIds: ids,
    downPaymentCents,
    termMonths,
    asOf,
    secondLifePricesCents: await secondLifePrices(db, ids),
  });
  if (!live.ok) {
    return fail(422, 'NOT_PRICEABLE', live.reason, {
      reason: live.reason,
      listPriceCents: live.listPriceCents ?? null,
      maxDownPaymentCents: live.maxDownPaymentCents ?? null,
      minDownPayment: live.minDownPayment ?? null,
    });
  }

  let affordability: AffordabilityResult | null = null;
  let suggestion: AffordableSuggestion | null = null;
  if (customerId) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    affordability = checkAffordability({
      monthlyRentWithVatCents: live.live.monthlyRentWithVatCents,
      monthlyNetIncomeCents: customer?.monthly_net_income_cents ?? null,
      isConsumer: customer?.type === 'consumer',
    });
    if (affordability.status === 'failed' && customer?.monthly_net_income_cents) {
      suggestion = suggestAffordableParameters({
        listPriceCents: live.live.listPriceCents,
        downPaymentCents,
        termMonths,
        monthlyNetIncomeCents: customer.monthly_net_income_cents,
        vatRateBasisPoints: Math.round(live.live.vatRatePercent * 100),
        table: await loadCoefficientTable(),
      });
    }
  }

  return ok({ ...live.live, affordability, suggestion });
});
