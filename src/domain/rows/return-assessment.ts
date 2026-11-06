// The write schema of a `ReturnAssessment` row (prisma/schema.prisma). Ready for the second
// life slice (src/server/second-life.ts).
import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import {
  centsSchema,
  conditionAtLeastAsGood,
  idSchema,
  isoDateSchema,
  jsonText,
  outcomeSchema,
  ON_VALID_FIELDS,
} from './fields';

/** One refurbishment step and what it costs. */
export const refurbishmentStepSchema = z.strictObject({
  step: z.string().min(1),
  cost_cents: centsSchema,
});

export const returnAssessmentRowSchema = z
  .strictObject({
    id: idSchema.optional(),
    asset_id: idSchema,
    /** Null for an item the data pack seeds as returned, with no lease in our books. */
    contract_id: idSchema.nullable(),
    assessed_on: isoDateSchema,
    /** As returned. */
    condition: assetConditionSchema,
    usage_value: z.number().int().nonnegative(),
    refurbishment_json: jsonText(z.array(refurbishmentStepSchema)),
    refurbish: z.boolean(),
    /** After refurbishment, or the same as `condition`. */
    new_condition: assetConditionSchema,
    market_value_cents: centsSchema,
    second_life_financed_cents: centsSchema,
    /** An id from data/second-life-demand.json, or null when nobody fits. */
    matched_demand_id: idSchema.nullable().optional(),
    match_reasons_json: jsonText(z.array(outcomeSchema)),
    /** The D12 options and the D13 match as computed, for the page (an object). */
    assessment_json: jsonText(z.record(z.string(), z.unknown())),
  })
  .superRefine((row, ctx) => {
    if (!row.refurbish && row.new_condition !== row.condition) {
      ctx.addIssue({
        code: 'custom',
        message: 'an item not refurbished keeps its condition',
        path: ['new_condition'],
      });
    }
    if (row.refurbish && !conditionAtLeastAsGood(row.new_condition, row.condition)) {
      ctx.addIssue({
        code: 'custom',
        message: 'refurbishing never makes an item worse',
        path: ['new_condition'],
      });
    }
  }, ON_VALID_FIELDS);
