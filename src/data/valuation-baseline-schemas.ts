import { z } from 'zod';
import { isoDateSchema } from './schemas';
import { storageCentsSchema } from './spine-value-schemas';

export const baselineCorrectionSchema = z.strictObject({
  firstUsedOn: isoDateSchema,
  originalPriceCents: storageCentsSchema.positive(),
  reason: z.string().trim().min(10).max(500),
});
export const valuationBaselineSchema = z.object({
  firstUsedOn: isoDateSchema,
  originalPriceCents: storageCentsSchema.positive(),
  source: z.enum([
    'imported_assumption',
    'recorded_lease',
    'operator_verified',
    'operator_assumption',
  ]),
  reason: z.string().nullable(),
});
export type ValuationBaseline = z.infer<typeof valuationBaselineSchema>;
