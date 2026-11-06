// GET /api/quote?assetId=ebike-003&downPaymentCents=0&termMonths=36[&quantity=1]
//                [&asOf=2026-11-05]
// Live pricing for the sliders. No write: a quote is only persisted when an application
// starts. For a signed-in customer it adds the affordability check and, when that fails, the
// "better chance of approval" suggestion — never a hard rejection before consent.
import { z } from 'zod';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import {
  checkAffordabilityOverTerm,
  suggestAffordableParameters,
  type AffordableSuggestion,
  type TermAffordabilityResult,
} from '@/domain/affordability';
import { fail, handleRoute, ok } from '@/server/api-response';
import { asOfFrom } from '@/server/as-of';
import { currentUser } from '@/server/current-user';
import { db } from '@/server/db';
import { existingPayments, newLeasePayments } from '@/server/payments';
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

  // The same rule as the decision: every month of the lease (starting today), together with
  // what the customer already pays on their other leases.
  let affordability: TermAffordabilityResult | null = null;
  let suggestion: AffordableSuggestion | null = null;
  if (customerId) {
    const [customer, vatRates, alreadyPaying] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId } }),
      loadVatRates(),
      existingPayments(db, { customerId, fromDate: asOf }),
    ]);
    const newPayments = await newLeasePayments(db, {
      startDate: asOf,
      asOf,
      termMonths,
      monthlyNetRentCents: live.live.quote.monthlyNetRentCents,
      netTotalCents: live.live.quote.netTotalCents,
      transferContractId: null,
      vatRates,
    });
    affordability = checkAffordabilityOverTerm({
      newPayments: newPayments ?? [],
      existingPayments: alreadyPaying,
      monthlyNetIncomeCents: customer?.monthly_net_income_cents ?? null,
      isConsumer: customer?.type === 'consumer',
    });
    if (affordability.status === 'failed' && customer?.monthly_net_income_cents) {
      const perMonth = new Map<string, number>();
      for (const p of alreadyPaying) {
        const month = p.dueDate.slice(0, 7);
        perMonth.set(month, (perMonth.get(month) ?? 0) + p.totalCents);
      }
      suggestion = suggestAffordableParameters({
        listPriceCents: live.live.listPriceCents,
        downPaymentCents,
        termMonths,
        monthlyNetIncomeCents: customer.monthly_net_income_cents,
        // The highest known VAT rate, so a suggestion holds in every month of the lease.
        vatRateBasisPoints: Math.max(
          ...vatRates.rates.map((r) => Math.round(r.rate_percent * 100)).filter((bp) => bp > 0),
          Math.round(live.live.vatRatePercent * 100)
        ),
        table: await loadCoefficientTable(),
        existingMonthlyCents: Math.max(0, ...perMonth.values()),
      });
    }
  }

  return ok({ ...live.live, affordability, suggestion });
});
