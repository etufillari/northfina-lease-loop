// Zod schemas of the second-life route (contract first): `POST /api/assets/[id]/assessments`
// assesses a returned asset on the request's day and relists it (admin only, D86, D13, D61).
// The row that uses them is in routes.ts. The day and the actor are the server's; the optional
// body is the admin's inspection (D77), each field defaulting to the stored (reported) value.
import { z } from 'zod';
import { assetConditionSchema, centsSchema, isoDateSchema } from '@/data/schemas';

export const assessmentParamsSchema = z.object({ id: z.string().min(1) });

/** The inspected condition and usage (D77); an empty body or {} assesses the stored values. */
export const assessmentBodySchema = z.strictObject({
  condition: assetConditionSchema.optional(),
  usageValue: z.number().int().nonnegative().optional(),
});

const outcomeSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.unknown()),
});

/** The success `data`: the decision and its numbers; the full D86 options and D13 steps too. */
export const assessmentResponseSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  contractId: z.string().nullable(),
  assessedOn: isoDateSchema,
  returnedCondition: assetConditionSchema,
  newCondition: assetConditionSchema,
  refurbish: z.boolean(),
  marketValueCents: centsSchema,
  refurbishmentCents: centsSchema,
  secondLifeFinancedCents: centsSchema,
  matchedDemandId: z.string().nullable(),
  decision: outcomeSchema,
  verdicts: z.array(z.object({ demandId: z.string(), outcome: outcomeSchema })),
  ranking: z.array(
    z.object({
      demandId: z.string(),
      rank: z.number().int().positive(),
      decidedBy: z.string().nullable(),
      monthlyNetCents: centsSchema,
      termMonths: z.number().int().positive(),
    })
  ),
});
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;

// ---------- the stored assessment (`ReturnAssessment.assessment_json`) ----------

const condition = assetConditionSchema;
const cents = centsSchema;
const planSchema = z
  .object({
    steps: z.array(z.object({ id: z.string(), costCents: cents }).loose()),
    totalCents: cents,
    usageAfter: z.object({ unit: z.string(), value: z.number().int().nonnegative() }),
  })
  .loose();
const optionSchema = z
  .object({
    condition,
    upgrade: z.boolean(),
    plan: planSchema,
    marketValue: z.object({ valueCents: cents, ageMonths: z.number().int() }).loose(),
    secondLifeFinancedCents: cents,
    // D86: absent on a row stored before it (the page then shows no comparison).
    comparison: z
      .object({
        valueGainCents: z.number().int(),
        extraCostCents: z.number().int(),
        netGainCents: z.number().int(),
        worthIt: z.boolean(),
      })
      .nullable()
      .optional(),
    rents: z.array(
      z.object({ termMonths: z.number().int(), monthlyNetCents: cents.nullable() }).loose()
    ),
  })
  .loose();

/**
 * What the page and the route read from a stored assessment, parsed before use: a row written by
 * an older build or edited by hand is reported as unreadable instead of crashing the page.
 */
export const storedAssessmentSchema = z.object({
  input: z
    .object({
      assetId: z.string(),
      usage: z.object({ unit: z.string(), value: z.number().int().nonnegative() }),
      newPriceCents: cents,
    })
    .loose(),
  assessment: z
    .object({
      assetId: z.string(),
      isoDate: isoDateSchema,
      ageMonths: z.number().int().nonnegative(),
      returnedCondition: condition,
      options: z.array(optionSchema).min(1),
    })
    .loose(),
  match: z
    .object({
      verdicts: z.array(z.object({ demandId: z.string(), outcome: outcomeSchema }).loose()),
      ranking: z.array(
        z.object({ demandId: z.string(), rank: z.number().int().positive() }).loose()
      ),
      winner: z.object({ demandId: z.string() }).loose().nullable(),
      decision: outcomeSchema,
      relist: optionSchema,
    })
    .loose(),
});
