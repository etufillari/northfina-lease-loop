// Zod schemas of the exit routes (contract first): buy out, return or pass on a contract, at
// the end of its term or early (D14, D16). The rows that use them are in routes.ts. The day is
// always the request's (`todayForRequest()`, demo clock included), never one from the browser.
import { z } from 'zod';
import { assetConditionSchema, centsSchema, isoDateSchema, usageUnitSchema } from '@/data/schemas';
import { returnReasonSchema } from '@/domain/events';
import { exitModeSchema } from '@/domain/exits/mode';
import { contractStatusSchema, invoiceKindSchema } from '@/domain/statuses';
import { contractViewSchema } from './contract-schemas';

export const exitParamsSchema = z.object({ id: z.string().min(1) });

/** The usage the customer reports; the unit must be the category's (km for an e-bike). */
export const reportedUsageSchema = z.strictObject({
  unit: usageUnitSchema,
  value: z.number().int().nonnegative().max(10_000_000),
});

/**
 * Query of `GET /api/contracts/[id]/exit-preview`. The condition and usage are what the
 * customer would report; left out, the catalogue's last known values are used.
 */
export const exitPreviewQuerySchema = z.object({
  mode: exitModeSchema,
  condition: assetConditionSchema.optional(),
  usageValue: z.coerce.number().int().nonnegative().max(10_000_000).optional(),
});

/**
 * Body of `POST /api/contracts/[id]/exit`. `reason` is optional: the server derives it from
 * the day (before the end date = `early_exit`) and refuses a body that says otherwise.
 */
export const exitBodySchema = z.strictObject({
  mode: exitModeSchema,
  reason: returnReasonSchema.optional(),
  condition: assetConditionSchema,
  usage: reportedUsageSchema,
  nextCustomerId: z.string().min(1).max(100).optional(),
});

/** One line of an exit's cost: a code with params, written by the page in the visitor's language. */
export const exitLineSchema = z.object({
  code: z.string(),
  effect: z.enum(['add', 'subtract', 'subtotal', 'info', 'total']),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

const exitOptionSchema = z.object({ totalCents: centsSchema, lines: z.array(exitLineSchema) });

/** The invoice an exit issues; null when there is nothing to bill. */
export const exitInvoiceSchema = z.object({
  kind: invoiceKindSchema,
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  netCents: centsSchema,
  vatRateBasisPoints: z.number().int().nonnegative(),
  vatCents: centsSchema,
  grossCents: centsSchema,
});

/** What an exit would do on the request's day, without writing anything. */
export const exitPreviewResponseSchema = z.object({
  today: isoDateSchema,
  mode: exitModeSchema,
  reason: returnReasonSchema,
  atOrAfterEnd: z.boolean(),
  status: contractStatusSchema,
  monthsPaid: z.number().int().nonnegative(),
  buy: exitOptionSchema,
  return: exitOptionSchema,
  /** D90: the return without the refurbishment. */
  passOn: exitOptionSchema,
  invoice: exitInvoiceSchema.nullable(),
  cancelInvoiceIds: z.array(z.string()),
});

/** After an exit: the contract with its new status and end day, and what was billed. */
export const exitResponseSchema = z.object({
  contract: contractViewSchema,
  plan: exitPreviewResponseSchema,
  /** D90: a pass-on's new quote for the next customer. */
  nextQuoteId: z.string().optional(),
});
