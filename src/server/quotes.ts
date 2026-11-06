// Quotes: a live preview that writes nothing, and saved quotes that a contract can be signed from.
import { randomUUID } from 'node:crypto';
import type { Quote as QuoteRow } from '@/generated/prisma/client';
import { assetStatusSchema } from '@/data/schemas';
import { forecastCost } from '@/domain/invoicing';
import {
  calculateQuote,
  quoteFromPriceList,
  type AssetQuote,
  type AssetQuoteResult,
  type QuoteBreakdown,
} from '@/domain/pricing';
import type { VatAmounts } from '@/domain/vat';
import { withAudit } from './audit';
import { refusal, type PricingData } from './pricing-data';
import type { PrismaClient } from './prisma-client';

export type QuoteRequest = {
  assetId: string;
  onDate: string;
  downPaymentCents: number;
  termMonths: number;
};

/** A quote plus what it costs with VAT if the lease started on the quote date. */
export type PricedQuote = AssetQuote & {
  /** The first month's rent with VAT. This is the amount to test affordability against. */
  firstRent: VatAmounts;
  totals: { netCents: number; vatCents: number; grossCents: number };
  buyout: VatAmounts & { invoiceDate: string };
  totalWithBuyoutGrossCents: number;
};

/** Pure quote → quote with VAT figures, forecast with the VAT rates known today. */
export function withCosts(quote: AssetQuote, data: PricingData): PricedQuote {
  const result = forecastCost({ ...quote, startDate: quote.quotedOn }, data.vatRates);
  if (!result.ok) throw refusal(result.reason, { date: result.date });

  const { invoices, ...costs } = result.forecast;
  const firstRent = invoices.find((invoice) => invoice.kind === 'rent');
  if (!firstRent) throw new Error('a schedule always has a rent invoice');
  return { ...quote, ...costs, firstRent };
}

function unwrap(result: AssetQuoteResult): AssetQuote {
  if (!result.ok) throw refusal(result.reason);
  return result.quote;
}

async function assertAssetAvailable(db: PrismaClient, assetId: string): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw refusal('unknown_asset');
  if (asset.status !== 'available') {
    throw refusal('asset_unavailable', { status: assetStatusSchema.parse(asset.status) });
  }
}

/** Prices a catalogue item without saving anything, for the sliders. */
export async function previewQuote(
  db: PrismaClient,
  data: PricingData,
  request: QuoteRequest
): Promise<PricedQuote> {
  await assertAssetAvailable(db, request.assetId);
  return withCosts(unwrap(quoteFromPriceList(data.priceLists, data.table, request)), data);
}

function toRowData(quote: AssetQuote) {
  return {
    asset_id: quote.assetId,
    quoted_on: quote.quotedOn,
    price_list_version: quote.priceListVersion,
    list_price_cents: quote.listPriceCents,
    down_payment_cents: quote.downPaymentCents,
    term_months: quote.termMonths,
    financed_cents: quote.financedCents,
    band: quote.band,
    monthly_factor: quote.monthlyFactor,
    annual_interest_percent: quote.annualInterestPercent,
    monthly_net_rent_cents: quote.monthlyNetRentCents,
    buyout_percent: quote.buyoutPercent,
    buyout_net_cents: quote.buyoutNetCents,
    contract_net_total_cents: quote.contractNetTotalCents,
  };
}

/** Pricing columns (shared by quotes and contracts) → the domain's breakdown. */
export function toBreakdown(
  row: Omit<ReturnType<typeof toRowData>, 'asset_id' | 'quoted_on' | 'price_list_version'>
): QuoteBreakdown {
  return {
    listPriceCents: row.list_price_cents,
    downPaymentCents: row.down_payment_cents,
    termMonths: row.term_months,
    financedCents: row.financed_cents,
    band: row.band,
    monthlyFactor: row.monthly_factor,
    annualInterestPercent: row.annual_interest_percent,
    monthlyNetRentCents: row.monthly_net_rent_cents,
    buyoutPercent: row.buyout_percent,
    buyoutNetCents: row.buyout_net_cents,
    contractNetTotalCents: row.contract_net_total_cents,
  };
}

export type SavedQuote = PricedQuote & { id: string; customerId: string | null };

export function toAssetQuote(row: QuoteRow): AssetQuote {
  return {
    ...toBreakdown(row),
    assetId: row.asset_id,
    quotedOn: row.quoted_on,
    priceListVersion: row.price_list_version,
  };
}

async function saveQuote(
  db: PrismaClient,
  data: PricingData,
  quote: AssetQuote,
  actor: string,
  customerId: string | null
): Promise<SavedQuote> {
  const id = randomUUID();
  const priced = withCosts(quote, data);
  await withAudit(
    db,
    {
      actor,
      action: 'quote.created',
      entityType: 'quote',
      entityId: id,
      details: {
        assetId: quote.assetId,
        priceListVersion: quote.priceListVersion,
        monthlyNetRentCents: quote.monthlyNetRentCents,
      },
    },
    (tx) => tx.quote.create({ data: { id, customer_id: customerId, ...toRowData(quote) } })
  );
  return { ...priced, id, customerId };
}

/** Saves a catalogue quote exactly as it was shown. */
export async function createQuote(
  db: PrismaClient,
  data: PricingData,
  request: QuoteRequest & { actor: string; customerId?: string }
): Promise<SavedQuote> {
  await assertAssetAvailable(db, request.assetId);
  const quote = unwrap(quoteFromPriceList(data.priceLists, data.table, request));
  return saveQuote(db, data, quote, request.actor, request.customerId ?? null);
}

/**
 * Saves a quote for a returned item, priced from its assessed net value instead of a list
 * price. Same calculation as a new lease. Server-side only: no route lets a client set a price.
 */
export async function createSecondLifeQuote(
  db: PrismaClient,
  data: PricingData,
  request: Omit<QuoteRequest, 'assetId'> & {
    assetId: string;
    assessedNetPriceCents: number;
    actor: string;
    customerId?: string;
  }
): Promise<SavedQuote> {
  const asset = await db.asset.findUnique({ where: { id: request.assetId } });
  if (!asset) throw refusal('unknown_asset');

  const result = calculateQuote(data.table, {
    listPriceCents: request.assessedNetPriceCents,
    downPaymentCents: request.downPaymentCents,
    termMonths: request.termMonths,
  });
  if (!result.ok) throw refusal(result.reason);

  const quote: AssetQuote = {
    ...result.quote,
    assetId: request.assetId,
    quotedOn: request.onDate,
    priceListVersion: null,
  };
  return saveQuote(db, data, quote, request.actor, request.customerId ?? null);
}

export async function getQuote(
  db: PrismaClient,
  data: PricingData,
  id: string
): Promise<SavedQuote> {
  const row = await db.quote.findUnique({ where: { id } });
  if (!row) throw refusal('quote_not_found');
  return { ...withCosts(toAssetQuote(row), data), id: row.id, customerId: row.customer_id };
}
