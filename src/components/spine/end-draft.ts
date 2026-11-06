import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';

// Consent is deliberately absent: only editing values may survive reload/locale changes.
export const endDraftSchema = z.object({
  choice: z.enum(['buy', 'return', 'pass_on']),
  condition: assetConditionSchema,
  usageText: z.string(),
  successorId: z.string(),
});
