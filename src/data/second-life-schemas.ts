import { z } from 'zod';
import { assetConditionSchema, isoDateSchema } from './schemas';
import { storageCentsSchema } from './spine-value-schemas';
import { baselineCorrectionSchema, valuationBaselineSchema } from './valuation-baseline-schemas';

const meter = z.number().int().nonnegative().max(2_147_483_647);
export const matchingPreviewInputSchema = z.strictObject({
  ageMonths: z.number().int().nonnegative().max(12000),
  originalPriceCents: storageCentsSchema.positive(),
  readyOn: isoDateSchema,
  lastServiceUsage: meter.optional(),
  useAutomaticBaseline: z.boolean().optional(),
  baselineCorrection: baselineCorrectionSchema.optional(),
});
export const matchingSelectionSchema = matchingPreviewInputSchema.extend({
  waitingRevision: z.number().int().nonnegative().optional(),
  waitingRequestId: z.string().min(1).max(100),
  nextCustomerId: z.string().min(1).max(100),
  overrideReason: z.string().trim().min(10).max(500).optional(),
});
export type MatchingPreviewInput = z.infer<typeof matchingPreviewInputSchema>;
export type MatchingSelection = z.infer<typeof matchingSelectionSchema>;

const candidateSchema = z.object({
  waitingRevision: z.number().int().nonnegative().nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  imported: z.boolean(),
  requestId: z.string(),
  condition: assetConditionSchema,
  termMonths: meter,
  neededBy: isoDateSchema,
  budgetNetCents: storageCentsSchema,
  netPriceCents: storageCentsSchema.nullable(),
  monthlyNetCents: storageCentsSchema.nullable(),
  workNetCents: storageCentsSchema.nullable(),
  netRecoveryCents: z.number().int().safe().nullable(),
  tasks: z.array(
    z.object({
      id: z.string(),
      netCostCents: storageCentsSchema,
      units: meter,
      resetsUsage: z.boolean(),
    })
  ),
  reasons: z.array(z.string()),
});
export const matchingPreviewSchema = z.object({
  valuationBaseline: valuationBaselineSchema,
  releaseRevision: meter,
  candidates: z.array(candidateSchema),
  recommendation: candidateSchema.nullable(),
});
export type MatchingPreview = z.infer<typeof matchingPreviewSchema>;
