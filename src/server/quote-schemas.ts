// Zod schemas of the pricing routes (contract first): the quote body, the preview query and the
// shapes of the breakdown, the comparison and the stored quote. The rows that use them are in
// routes.ts; they live here so the four wave 1 slices do not all grow one file.
import { z } from 'zod';
import { centsSchema, isoDateSchema } from '@/data/schemas';

const intFromQuery = z.coerce.number().int();

/** Body of `POST /api/quotes`: one unique item (D8). The day is the request's, never the browser's;
 * strict, so a `quantity` (or any other unknown key) is refused, not ignored. */
export const createQuoteBodySchema = z.strictObject({
  assetId: z.string().min(1).max(100),
  termMonths: z.number().int().positive(),
  downPaymentCents: centsSchema,
});

/** Query of `GET /api/quotes/preview`, the live sliders: one unique item (D8). */
export const previewQuoteQuerySchema = z.object({
  assetId: z.string().min(1).max(100),
  termMonths: intFromQuery.positive(),
  downPaymentCents: intFromQuery.nonnegative().default(0),
});

export const quoteIdParamsSchema = z.object({ id: z.string().min(1) });

export const quoteBreakdownSchema = z.object({
  assetId: z.string(),
  /** Always 1 (D8): the stored column, kept for signing's guard (D76). */
  quantity: z.number().int().positive(),
  isoDate: isoDateSchema,
  priceListVersion: z.number().int(),
  unitListPriceCents: centsSchema,
  listPriceCents: centsSchema,
  downPaymentCents: centsSchema,
  financedCents: centsSchema,
  band: z.string(),
  factorMillionths: z.number().int(),
  termMonths: z.number().int(),
  monthlyNetCents: centsSchema,
  vatRateBasisPoints: z.number().int(),
  monthlyVatCents: centsSchema,
  monthlyGrossCents: centsSchema,
  buyoutPercentBasisPoints: z.number().int(),
  buyoutCents: centsSchema,
  downPaymentVatCents: centsSchema,
  downPaymentGrossCents: centsSchema,
  buyoutVatCents: centsSchema,
  buyoutGrossCents: centsSchema,
  totalIfReturnCents: centsSchema,
  totalIfBuyCents: centsSchema,
  vatIsEstimate: z.literal(true),
});

/** A refusal as a code with params; the page writes it in the visitor's language. */
export const quoteRefusalSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
});

export const termRowSchema = z.object({
  termMonths: z.number().int(),
  band: z.string(),
  monthlyNetCents: centsSchema,
  monthlyGrossCents: centsSchema,
  buyoutCents: centsSchema,
  buyoutGrossCents: centsSchema,
  totalIfReturnCents: centsSchema,
  totalIfBuyCents: centsSchema,
});

export const previewQuoteResponseSchema = z.object({
  today: isoDateSchema,
  quote: quoteBreakdownSchema.nullable(),
  refusal: quoteRefusalSchema.nullable(),
  comparison: z.object({
    rows: z.array(termRowSchema),
    unavailable: z.array(z.object({ termMonths: z.number().int(), reason: quoteRefusalSchema })),
  }),
});

export const quoteStatusSchema = z.object({
  status: z.enum(['valid', 'expired']),
  validUntil: isoDateSchema,
  lockedListVersion: z.number().int(),
  lockedUnitPriceCents: centsSchema,
  todayList: z.object({ version: z.number().int(), unitPriceCents: centsSchema }).nullable(),
  cheaperListLive: z.boolean(),
});

export const storedQuoteResponseSchema = z.object({
  id: z.string(),
  quoteDate: isoDateSchema,
  validUntil: isoDateSchema,
  createdAt: z.iso.datetime(),
  breakdown: quoteBreakdownSchema,
  statusToday: quoteStatusSchema,
});
