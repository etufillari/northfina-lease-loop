import { loadCoefficientTable } from '@/data/load';
import { addDays } from '@/domain/calendar';
import { canScheduleLease } from '@/domain/invoicing';
import { calculatePrice } from '@/domain/pricing';
import type { Quote } from '@/generated/prisma/client';
import { ApiError } from './api-response';
import { withAudit } from './audit';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { rethrowDatabaseConflict } from './request-integrity';
import { readAssetOffer } from './spine-offers';
import type { QuoteInput } from './spine-shapes';
import { priceTermsSchema } from './spine-shapes';
import { quoteView } from './spine-views';

function reuseQuote(row: Quote, context: DemoContext, input: QuoteInput) {
  const terms = priceTermsSchema.parse(JSON.parse(row.terms_json));
  if (
    row.customer_id !== context.customer.id ||
    row.asset_id !== input.assetId ||
    row.start_date !== input.startDate ||
    terms.termMonths !== input.termMonths ||
    terms.downPaymentCents !== input.downPaymentCents
  ) {
    throw new ApiError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This request identifier already belongs to another offer'
    );
  }
  return quoteView(row);
}

export async function ownedQuote(db: PrismaClient, context: DemoContext, id: string) {
  requireCustomer(context);
  const quote = await db.quote.findFirst({ where: { id, customer_id: context.customer.id } });
  if (!quote) throw new ApiError(404, 'QUOTE_NOT_FOUND', 'The offer was not found');
  return quote;
}

function requireSchedulableLease(startDate: string, termMonths: number): void {
  if (!canScheduleLease(startDate, termMonths)) {
    throw new ApiError(
      422,
      'INVALID_START_DATE',
      'Choose a valid start date that allows the full lease term'
    );
  }
}

export function requireValidQuote(quote: Quote, businessDate: string): void {
  if (businessDate < quote.priced_on || businessDate > quote.valid_through) {
    throw new ApiError(409, 'QUOTE_EXPIRED', 'Review a new offer before continuing');
  }
  if (businessDate > quote.start_date) {
    throw new ApiError(409, 'INVALID_START_DATE', 'Choose a new start date and review the offer');
  }
  const terms = priceTermsSchema.parse(JSON.parse(quote.terms_json));
  requireSchedulableLease(quote.start_date, terms.termMonths);
}

export async function createQuote(db: PrismaClient, context: DemoContext, input: QuoteInput) {
  requireCustomer(context);
  const existing = await db.quote.findUnique({ where: { id: input.requestId } });
  if (existing) return reuseQuote(existing, context, input);
  requireSchedulableLease(input.startDate, input.termMonths);
  if (input.startDate < context.businessDate) {
    throw new ApiError(
      422,
      'INVALID_START_DATE',
      'The lease cannot start before the business date'
    );
  }

  const [item, table] = await Promise.all([
    readAssetOffer(db, input.assetId, context.businessDate),
    loadCoefficientTable(),
  ]);
  if (item.asset.status !== 'available') {
    throw new ApiError(409, 'ASSET_UNAVAILABLE', 'This item is not available to lease');
  }
  if (
    item.release?.reserved_for_customer_id &&
    item.release.reserved_for_customer_id !== context.customer.id
  ) {
    throw new ApiError(
      409,
      'ASSET_RESERVED',
      'The item is reserved for the nominated next customer'
    );
  }
  if (!item.offer || table.valid_from > context.businessDate) {
    throw new ApiError(422, 'QUOTE_UNAVAILABLE', 'There is no valid offer on this date');
  }
  const priced = calculatePrice({
    listPriceCents: item.offer.priceCents,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
    table,
  });
  if (!priced.ok) {
    throw new ApiError(422, 'QUOTE_UNAVAILABLE', 'The selected amount or term cannot be financed', {
      reason: priced.reason,
    });
  }
  const offer = item.offer;
  const sevenDaysLater = addDays(context.businessDate, 7);
  const validThrough = input.startDate < sevenDaysLater ? input.startDate : sevenDaysLater;
  try {
    const quote = await withAudit(
      db,
      {
        actor: context.actor,
        action: 'quote.created',
        entityType: 'quote',
        entityId: input.requestId,
        details: { assetId: input.assetId, priceSource: offer.source },
      },
      async (tx) => {
        // Recheck mutable availability inside the transaction; a quote itself is not a reservation.
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
        const release = await tx.assetRelease.findUnique({ where: { asset_id: input.assetId } });
        if (asset.status !== 'available' || (release?.revision ?? 0) !== offer.releaseRevision) {
          throw new ApiError(
            409,
            'ASSET_UNAVAILABLE',
            'The item changed; refresh before continuing'
          );
        }
        return tx.quote.create({
          data: {
            id: input.requestId,
            customer_id: context.customer.id,
            asset_id: input.assetId,
            priced_on: context.businessDate,
            start_date: input.startDate,
            valid_through: validThrough,
            release_revision: offer.releaseRevision,
            price_source: offer.source,
            terms_json: JSON.stringify(priced.terms),
          },
        });
      }
    );
    return quoteView(quote);
  } catch (error) {
    const committed = await db.quote.findUnique({ where: { id: input.requestId } });
    if (committed) return reuseQuote(committed, context, input);
    rethrowDatabaseConflict(error);
  }
}
