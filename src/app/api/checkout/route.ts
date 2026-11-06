import { z } from 'zod';
import { applicationCart } from '@/domain/application-cart';
import { requireApplicationApproval } from '@/server/applications';
import { checkoutQuote } from '@/domain/checkout-quote';
import type { ApplicationAnswers } from '@/domain/application';
import { initialContractStatus, pendingSignatory } from '@/domain/signatory';
import { ApiError, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { authSettings } from '@/server/auth-config';
import { assertSameOrigin } from '@/server/auth-input';
import { requireIdentity } from '@/server/auth-session';
import { withAudit, type AuditEntry } from '@/server/audit';
import { checkoutOptions } from '@/server/checkout-options';
import { loadQuestions } from '@/data/load';
import { db } from '@/server/db';
import { requestToday } from '@/server/demo-mode';

const schema = z.strictObject({
  token: z.uuid(),
  applicationId: z.string().min(1).max(80),
  date: z.iso.date(),
  items: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(80),
        priceCents: z.number().int().nonnegative(),
        monthlyTotalCents: z.number().int().nonnegative(),
        version: z.number().int(),
        termMonths: z.number().int().min(1).max(60),
        downPaymentCents: z.number().int().nonnegative(),
      })
    )
    .min(1)
    .max(10),
  delivery: z.enum(['delivery', 'pickup']),
  address: z.string().trim().min(3).max(200),
  payment: z.enum(['card', 'invoice']),
  /** The customer saw and accepted today's price where it differs from their quote (card 2). */
  acceptPriceChange: z.boolean().optional(),
});

async function checkoutBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    throw new ApiError(415, 'INVALID_CONTENT_TYPE', 'JSON is required.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 8192) {
          await reader.cancel();
          throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return readJsonBody(new Request(request.url, { method: 'POST', body: bytes }), schema);
}

export const POST = handleRoute(async (request) => {
  assertSameOrigin(request, authSettings());
  const identity = await requireIdentity(db, request.headers);
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
  const input = await checkoutBody(request);
  if (new Set(input.items.map((item) => item.id)).size !== input.items.length)
    throw new ApiError(400, 'INVALID_CART', 'Duplicate items.');
  const existingIds = input.items.map((item) => `demo-${input.token}-${item.id}`);
  const completed = await db.contract.findMany({ where: { id: { in: existingIds } } });
  if (completed.length) {
    if (
      completed.length !== input.items.length ||
      completed.some((contract) => {
        const item = input.items.find((item) => item.id === contract.assetId);
        return (
          !item ||
          contract.customerId !== identity.customerId ||
          contract.termMonths !== item.termMonths ||
          contract.downPaymentCents !== item.downPaymentCents ||
          contract.listPriceCents !== item.priceCents ||
          contract.priceListVersion !== item.version
        );
      })
    )
      throw new ApiError(409, 'CHECKOUT_CONFLICT', 'Checkout cannot be repeated.');
    return ok({ ids: existingIds }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }
  const today = requestToday(request);
  if (input.date !== today) throw new ApiError(409, 'QUOTE_CHANGED', 'The quote date has changed.');
  const data = await checkoutOptions(today);
  const quotes = input.items.map((item) => {
    const option = data.options.find((option) => option.id === item.id);
    const calculated =
      option &&
      checkoutQuote(
        option.priceCents,
        item.downPaymentCents,
        item.termMonths,
        today,
        data.table,
        data.rates
      );
    if (
      !option ||
      !calculated ||
      !option.available ||
      option.priceCents !== item.priceCents ||
      calculated.monthlyTotalCents !== item.monthlyTotalCents ||
      option.priceListVersion !== item.version
    )
      throw new ApiError(409, 'QUOTE_CHANGED', 'A product or its price has changed.');
    return {
      ...option,
      ...calculated,
      annualRateBasisPoints: Math.round(
        data.table.bands.find(
          (band) =>
            option.priceCents - item.downPaymentCents >= band.min_financed_cents &&
            option.priceCents - item.downPaymentCents <= band.max_financed_cents
        )!.annual_interest_percent * 100
      ),
      termMonths: item.termMonths,
      downPaymentCents: item.downPaymentCents,
    };
  });
  const ids = quotes.map((quote) => `demo-${input.token}-${quote.id}`);
  const entry: AuditEntry = {
    actor: identity.id,
    action: 'lease.simulated_checkout',
    entityType: 'customer',
    entityId: identity.customerId,
    details: { delivery: input.delivery, payment: input.payment, count: quotes.length },
  };
  await withAudit(db, entry, async (tx) => {
    const application = applicationCart(data, input.items);
    if (!application) throw new ApiError(409, 'QUOTE_CHANGED', 'Please review your cart.');
    const approved = await requireApplicationApproval(
      tx,
      identity.customerId,
      input.applicationId,
      application,
      today,
      await loadQuestions()
    );
    // Card 2: signing locks today's price list. A price that differs from the quote is never
    // signed silently: the customer must have seen and accepted it.
    if (approved.changes.length && !input.acceptPriceChange)
      throw new ApiError(409, 'PRICE_CHANGED', 'The price has changed since your quote.', {
        changes: approved.changes,
      });
    if (approved.changes.length)
      entry.details = { ...(entry.details as object), priceChanges: approved.changes };
    // Card 6: an applicant who can't sign for the company named who can.
    const signatory = pendingSignatory(
      z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(approved.application.answersJson)) as ApplicationAnswers
    );
    if (signatory)
      entry.details = { ...(entry.details as object), awaitingSignatureFrom: signatory };
    const existing = await tx.contract.findMany({
      where: { id: { in: ids } },
      select: { id: true, customerId: true },
    });
    if (existing.length) {
      if (
        existing.length === ids.length &&
        existing.every((item) => item.customerId === identity.customerId)
      )
        return;
      throw new ApiError(409, 'CHECKOUT_CONFLICT', 'Checkout cannot be repeated.');
    }
    for (const [index, quote] of quotes.entries()) {
      const asset = await tx.asset.findUnique({
        where: { id: quote.id },
        select: {
          status: true,
          originalPriceCents: true,
          firstLeaseDate: true,
          condition: true,
          usage_value: true,
        },
      });
      if (!asset || asset.status !== 'available')
        throw new ApiError(409, 'QUOTE_CHANGED', 'A product is unavailable.');
      await tx.asset.update({
        where: { id: quote.id },
        data: {
          status: 'reserved',
          originalPriceCents: asset.originalPriceCents ?? quote.priceCents,
          firstLeaseDate: asset.firstLeaseDate ?? today,
        },
      });
      const quotedChange = approved.changes.find((change) => change.id === quote.id);
      await tx.contract.create({
        data: {
          id: ids[index]!,
          // Kept only when signing used a different price than the quote, to explain it later.
          ...(quotedChange
            ? {
                quotedOn: approved.application.startDate,
                quotedPriceCents: quotedChange.quotedPriceCents,
                quotedPriceListVersion: quotedChange.quotedPriceListVersion,
              }
            : {}),
          customerId: identity.customerId,
          assetId: quote.id,
          startDate: today,
          termMonths: quote.termMonths,
          listPriceCents: quote.priceCents,
          downPaymentCents: quote.downPaymentCents,
          startCondition: asset.condition,
          startUsageValue: asset.usage_value,
          annualRateBasisPoints: quote.annualRateBasisPoints,
          monthlyNetCents: quote.monthlyNetCents,
          buyoutCents: quote.buyoutCents,
          priceListVersion: quote.priceListVersion,
          isDemo: true,
          // The price is locked now; a contract waiting for the company's signatory is only
          // signed (and billed) once they sign.
          status: initialContractStatus(signatory),
          signatoryEmail: signatory,
          ...(signatory ? {} : { events: { create: { kind: 'signed', eventDate: today } } }),
        },
      });
    }
  });
  return ok({ ids }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
