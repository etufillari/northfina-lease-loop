import { z } from 'zod';
import { assetCategorySchema, assetConditionSchema, isoDateSchema } from './schemas';
import { storageCentsSchema } from './spine-value-schemas';

export const joinWaitingInputSchema = z.strictObject({
  requestId: z.uuid(),
  category: assetCategorySchema,
  minCondition: assetConditionSchema.exclude(['poor']),
  monthlyBudgetCents: storageCentsSchema.positive(),
  termMonths: z.number().int().positive().max(120),
  neededBy: isoDateSchema,
});
export type JoinWaitingInput = z.infer<typeof joinWaitingInputSchema>;
export const updateWaitingInputSchema = joinWaitingInputSchema.omit({ category: true }).extend({
  revision: z.number().int().nonnegative().max(2_147_483_646),
});
export type UpdateWaitingInput = z.infer<typeof updateWaitingInputSchema>;
export const waitingActionSchema = z.object({ id: z.uuid() });
export const ownWaitingListSchema = z.array(
  z.object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    category: assetCategorySchema,
    min_condition: assetConditionSchema,
    max_monthly_net_rent_cents: storageCentsSchema,
    preferred_term_months: z.number().int().positive(),
    needed_by: isoDateSchema,
    submitted_on: isoDateSchema,
    status: z.enum(['pending', 'allocated', 'cancelled']),
    allocated_asset_id: z.string().nullable(),
  })
);
export type OwnWaitingRequests = z.infer<typeof ownWaitingListSchema>;
