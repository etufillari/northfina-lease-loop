// Stored quotes (D-034). The server prices a quote from the asset, term and down payment alone;
// amounts from the browser are never trusted. A stored quote is what signing locks, so the price
// the customer saw is the price in the contract.
import { z } from 'zod';
import { priceCheckAtSigning, type PriceCheck } from '@/domain/contract';
import { makeQuote, type Quote, type QuoteResult } from '@/domain/quote';
import { quoteStatus, type QuoteStatus } from '@/domain/signing';
import { withAudit } from './audit';
import type { LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';
import { pricingPriceLists } from './pricing-price-lists';
import { parseStoredJson } from './stored-row';

export interface CreateQuoteInput {
  assetId: string;
  termMonths: number;
  downPaymentCents: number;
  /** The effective today (D-030): the quote date. */
  today: string;
  actor: string;
}

/** Every reason `createQuote` refuses; `POST /api/quotes` answers each in upper case. */
export type CreateQuoteRefusal =
  'asset_not_found' | 'asset_not_available' | Extract<QuoteResult, { ok: false }>['reason'];

export type CreateQuoteResult =
  { ok: true; id: number; quote: Quote } | { ok: false; reason: CreateQuoteRefusal };

export interface StoredQuote {
  id: number;
  quote: Quote;
  /** The contract that used this quote, once signed. */
  contractId: number | null;
  /** The quote this one replaced when the customer took today's cheaper price. */
  replacesQuoteId: number | null;
}

/** Mirrors the domain `Quote` type, so a hand-edited row is caught when read. */
export const quoteSchema = z.strictObject({
  assetId: z.string(),
  quoteDate: z.iso.date(),
  validUntil: z.iso.date(),
  termMonths: z.number().int().positive(),
  downPaymentCents: z.number().int().nonnegative(),
  priceListVersion: z.number().int().positive(),
  coefficientTableId: z.string(),
  listPriceCents: z.number().int().positive(),
  financedCents: z.number().int().positive(),
  band: z.string(),
  factor: z.number().positive(),
  monthlyNetRentCents: z.number().int().positive(),
  buyoutCents: z.number().int().nonnegative(),
  totalNetRentCents: z.number().int().positive(),
  totalNetCostCents: z.number().int().positive(),
}) satisfies z.ZodType<Quote>;

/** Domain quote → columns for a new row. The JSON holds every amount; columns are copies. */
export function toQuoteRowData(quote: Quote) {
  return {
    asset_id: quote.assetId,
    quote_date: quote.quoteDate,
    valid_until: quote.validUntil,
    price_list_version: quote.priceListVersion,
    term_months: quote.termMonths,
    down_payment_cents: quote.downPaymentCents,
    monthly_net_rent_cents: quote.monthlyNetRentCents,
    terms_json: JSON.stringify(quote),
  };
}

export async function createQuote(
  db: PrismaClient,
  data: Pick<LeaseDataPack, 'priceLists' | 'coefficientTable'>,
  input: CreateQuoteInput
): Promise<CreateQuoteResult> {
  const asset = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  if (asset.status !== 'available') return { ok: false, reason: 'asset_not_available' };

  const priced = makeQuote(await pricingPriceLists(db, data), data.coefficientTable, {
    assetId: input.assetId,
    quoteDate: input.today,
    termMonths: input.termMonths,
    downPaymentCents: input.downPaymentCents,
  });
  if (!priced.ok) return priced;
  const { quote } = priced;

  const row = await withAudit(
    db,
    (created: { id: number }) => ({
      actor: input.actor,
      action: 'quote.created',
      entityType: 'quote',
      entityId: String(created.id),
      details: {
        assetId: quote.assetId,
        termMonths: quote.termMonths,
        downPaymentCents: quote.downPaymentCents,
        monthlyNetRentCents: quote.monthlyNetRentCents,
        priceListVersion: quote.priceListVersion,
        validUntil: quote.validUntil,
        asOf: input.today, // the effective date, which can be a demo date (D-030)
      },
    }),
    (tx) => tx.quote.create({ data: toQuoteRowData(quote), select: { id: true } })
  );
  return { ok: true, id: row.id, quote };
}

export async function getQuote(db: PrismaClient, id: number): Promise<StoredQuote | null> {
  const row = await db.quote.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    quote: parseStoredJson(quoteSchema, row.terms_json, { table: 'quote', id }),
    contractId: row.contract_id,
    replacesQuoteId: row.replaces_quote_id,
  };
}

export interface QuoteView extends StoredQuote {
  status: QuoteStatus;
  /** What signing today would change; only while the quote can still be signed. */
  priceCheck: PriceCheck | null;
}

/** A stored quote as the customer sees it on `today`: can it be signed, and is today cheaper? */
export async function viewQuote(
  db: PrismaClient,
  data: Pick<LeaseDataPack, 'priceLists' | 'coefficientTable'>,
  id: number,
  today: string
): Promise<QuoteView | null> {
  const stored = await getQuote(db, id);
  if (!stored) return null;
  const status = quoteStatus(stored.quote, today, stored.contractId !== null);
  const priceCheck =
    status === 'open'
      ? priceCheckAtSigning(
          await pricingPriceLists(db, data),
          data.coefficientTable,
          stored.quote,
          today
        )
      : null;
  return { ...stored, status, priceCheck };
}
