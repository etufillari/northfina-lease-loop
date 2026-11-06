// Zod schemas of the contract routes (contract first): the signing body, the id params and the
// contract as the API returns it. The rows that use them are in routes.ts; they live here so
// the wave 2 slices do not all grow one file.
import { z } from 'zod';
import { centsSchema, isoDateSchema } from '@/data/schemas';
import { contractStatusSchema } from '@/domain/statuses';

/**
 * Body of `POST /api/contracts`. The signing day is the request's (`todayForRequest()`), never
 * the browser's; `startDate` is a business date the customer picks, checked against it (D7).
 * Left out, the lease starts on the signing day.
 */
export const signContractBodySchema = z.strictObject({
  applicationId: z.string().min(1).max(100),
  startDate: isoDateSchema.optional(),
});

export const contractIdParamsSchema = z.object({ id: z.string().min(1) });

/** A code with params; the page writes it in the visitor's language. */
export const contractCodeSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
});

/** A signed contract: the quote's frozen numbers, copied at signing and never re-priced (D7). */
export const contractViewSchema = z.object({
  id: z.string(),
  number: z.string(),
  applicationId: z.string(),
  customerId: z.string(),
  assetId: z.string(),
  quantity: z.number().int().positive(),
  signedOn: isoDateSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  termMonths: z.number().int().positive(),
  /** Per unit. */
  unitListPriceCents: centsSchema,
  downPaymentCents: centsSchema,
  financedCents: centsSchema,
  band: z.string(),
  factorMillionths: z.number().int(),
  monthlyNetCents: centsSchema,
  buyoutCents: centsSchema,
  vatRateBasisPoints: z.number().int(),
  priceListVersion: z.number().int(),
  status: contractStatusSchema,
  endedOn: isoDateSchema.nullable(),
});

/** The contract and, when the price list has changed since the quote, why its price holds (card 2). */
export const contractResponseSchema = z.object({
  contract: contractViewSchema,
  quoteDate: isoDateSchema,
  priceLock: contractCodeSchema.nullable(),
});
