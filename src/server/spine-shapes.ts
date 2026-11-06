import { z } from 'zod';
import { assetConditionSchema, isoDateSchema } from '@/data/schemas';
import { matchingSelectionSchema } from '@/data/second-life-schemas';

import { storageCentsSchema as cents } from '@/data/spine-value-schemas';
export { priceTermsSchema } from '@/data/spine-value-schemas';
export const requestIdSchema = z.uuid();
export const answersSchema = z.record(
  z
    .string()
    .regex(/^q_[a-z0-9_]+$/)
    .refine((key) => key === key.trim()),
  z.union([z.string().max(2000), cents, z.array(z.string().max(200)).max(30)])
);

export const quoteInputSchema = z.strictObject({
  requestId: requestIdSchema,
  assetId: z.string().min(1).max(100),
  termMonths: z.number().int().positive().max(120),
  downPaymentCents: cents,
  startDate: isoDateSchema,
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const applicationInputSchema = z.strictObject({
  requestId: requestIdSchema,
  quoteId: requestIdSchema,
  answers: answersSchema,
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

export const signInputSchema = z.strictObject({ applicationId: requestIdSchema });
export const emptyInputSchema = z.strictObject({});

export const endInputSchema = z.strictObject({
  requestId: requestIdSchema,
  choice: z.enum(['buy', 'return', 'pass_on']),
  condition: assetConditionSchema,
  usageValue: z.number().int().nonnegative().max(2_147_483_647),
  nextCustomerId: z.string().min(1).max(100).optional(),
});
export type EndInput = z.infer<typeof endInputSchema>;

export const relistInputSchema = z.strictObject({
  matching: matchingSelectionSchema.optional(),
  releaseRevision: z.number().int().nonnegative(),
  requestId: requestIdSchema,
  netPriceCents: cents.positive(),
  valuationReason: z.string().trim().min(10).max(500),
  condition: assetConditionSchema,
  completedTaskIds: z.array(z.string().min(1).max(100)).max(20),
  lastServiceUsage: z.number().int().nonnegative().max(2_147_483_647).optional(),
});
export type RelistInput = z.infer<typeof relistInputSchema>;
