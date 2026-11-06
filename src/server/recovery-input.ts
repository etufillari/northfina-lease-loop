import { z } from 'zod';
import { assetConditionSchema } from '@/data/schemas';
import { checkResults, damageLiabilities, damageTypes, usageSources } from '@/domain/inspection';
import { ApiError, readJsonBody } from './api-response';

export const reportIssuesByCategory = {
  e_bike: [
    'cosmetic_scratches',
    'dents',
    'missing_accessories',
    'not_working',
    'brakes_fault',
    'tyres_worn',
    'drive_fault',
    'battery_weak',
  ],
  laptop: [
    'cosmetic_scratches',
    'dents',
    'missing_accessories',
    'not_working',
    'screen_damage',
    'keyboard_fault',
    'network_fault',
    'charging_fault',
    'cooling_fault',
    'speed_fault',
    'camera_audio_fault',
    'hinge_fault',
    'liquid_fault',
    'battery_weak',
  ],
  farm_machine: [
    'cosmetic_scratches',
    'dents',
    'missing_accessories',
    'not_working',
    'engine_fault',
    'hydraulic_fault',
    'service_due',
  ],
} as const;
const repairLineSchema = z.object({ id: z.string(), netCents: z.number().int().nonnegative() });
export const recoveryReportSchema = z.strictObject({
  condition: assetConditionSchema,
  usageValue: z.number().int().min(0).max(100_000_000),
  issues: z.array(z.string().max(60)).max(20),
  notes: z.string().trim().max(1000).default(''),
  preferredDate: z.iso.date().optional(),
  answers: z
    .strictObject({
      power: z.enum(['working', 'minor', 'fault', 'unknown']),
      batteryKnown: z.boolean(),
      batteryHealth: z.number().int().min(0).max(100).nullable(),
      functions: z.record(z.string().max(60), z.enum(['working', 'minor', 'fault', 'unknown'])),
      cosmetic: z.enum(['same', 'light', 'deep', 'broken']),
      accessories: z.enum(['complete', 'missing', 'unknown']),
    })
    .optional(),
  replacement: z
    .strictObject({
      id: z.string().min(1).max(80),
      termMonths: z.number().int().min(12).max(60),
      downPaymentCents: z.number().int().nonnegative(),
    })
    .optional(),
  replacementQuote: z
    .object({
      name: z.string(),
      monthlyTotalCents: z.number().int(),
      termMonths: z.number().int(),
      totalCents: z.number().int(),
      quoteDate: z.iso.date(),
    })
    .optional(),
  /** The price shown in the return form. The server sets this; anything sent by a client is ignored. */
  agreedPrice: z
    .object({
      vatBasisPoints: z.number().int().nonnegative(),
      earlyReturnNetCents: z.number().int().nonnegative(),
      customerRepairNetCents: z.number().int().nonnegative(),
      repairShareBasisPoints: z.number().int().nonnegative(),
      lines: z.array(repairLineSchema).max(20),
    })
    .optional(),
});
export type RecoveryReport = z.infer<typeof recoveryReportSchema>;
const repairCents = z.number().int().min(0).max(25_000_000);
export const inspectionRecordSchema = z.strictObject({
  usageSource: z.enum(usageSources).optional(),
  customerPresent: z.boolean(),
  checks: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(60),
        result: z.enum(checkResults),
        repairCents,
        note: z.string().trim().max(300),
        chargeable: z.boolean().optional(),
      })
    )
    .max(40),
  readings: z
    .array(z.strictObject({ id: z.string().min(1).max(60), value: z.number().nullable() }))
    .max(20),
  damage: z
    .array(
      z.strictObject({
        area: z.string().trim().min(1).max(80),
        type: z.enum(damageTypes),
        liability: z.enum(damageLiabilities),
        repairCents,
      })
    )
    .max(12),
});
const inspectionFields = {
  condition: assetConditionSchema,
  targetCondition: z.enum(['good', 'like_new']),
  usageValue: z.number().int().min(0).max(100_000_000),
  ageMonths: z.number().int().min(0).max(1200),
  notes: z.string().trim().max(1000).default(''),
};
export const inspectionSchema = z.strictObject({
  ...inspectionFields,
  additionalRepairCents: repairCents,
  /** Absent only on assessments saved before itemized inspections existed. */
  record: inspectionRecordSchema.optional(),
});
export type RecoveryInspection = z.infer<typeof inspectionSchema>;
export const recoveryCalculationSchema = z.object({
  quoteDate: z.iso.date(),
  originalPriceCents: z.number().int().nonnegative(),
  firstLeaseDate: z.iso.date(),
  ageMonths: z.number().int().nonnegative(),
  annualRateBasisPoints: z.number().int().nonnegative(),
  rateSource: z.string(),
  vatBasisPoints: z.number().int().nonnegative(),
  outstandingInvoiceCents: z.number().int().nonnegative().default(0),
  accruedUnissuedCents: z.number().int().nonnegative().default(0),
  damageNetCents: z.number().int().nonnegative().default(0),
  /** The logged damage behind the customer's charge, so they can see what they are paying for. */
  chargeableDamage: z
    .array(
      z.object({
        area: z.string(),
        type: z.string(),
        netCents: z.number().int(),
        checkId: z.string().optional(),
      })
    )
    .default([]),
  /** The repairs behind a price agreed in the return form. Absent when inspection set the price. */
  agreedLines: z.array(repairLineSchema).optional(),
  recovery: z.object({
    asReturnedValueCents: z.number().int().nonnegative(),
    postRepairValueCents: z.number().int().nonnegative(),
    refurbishmentCostCents: z.number().int().nonnegative(),
    netRecoveryCents: z.number().int(),
    workItems: z.array(
      z.object({ id: z.string(), costCents: z.number().int().nonnegative(), reason: z.string() })
    ),
    valueUpliftCents: z.number().int(),
    policyVersion: z.string(),
  }),
  settlement: z.object({
    buyoutNetCents: z.number().int().nonnegative(),
    buyoutTotalCents: z.number().int().nonnegative(),
    returnNetCents: z.number().int().nonnegative(),
    returnTotalCents: z.number().int().nonnegative(),
    earlyReturnNetCents: z.number().int().nonnegative().default(0),
    customerRepairNetCents: z.number().int().nonnegative().default(0),
    repairShareBasisPoints: z.number().int().nonnegative().default(10000),
    remainingRentNetCents: z.number().int().nonnegative(),
    policyVersion: z.string(),
  }),
});
export type RecoveryCalculation = z.infer<typeof recoveryCalculationSchema>;
export const staffRecoveryActionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...inspectionFields,
    action: z.literal('assess'),
    // The repair total is derived from these lines on the server, never sent separately.
    record: inspectionRecordSchema,
  }),
  z.strictObject({ action: z.literal('receive') }),
  z.strictObject({
    action: z.literal('publish'),
    // The price the staff member saw; publishing fails if today's price differs.
    expectedPriceCents: z.number().int().nonnegative(),
  }),
  z.strictObject({ action: z.literal('retire') }),
]);
export type StaffRecoveryAction = z.infer<typeof staffRecoveryActionSchema>;

/** Bound JSON even when Content-Length is omitted; return the app's safe API errors. */
export async function readRecoveryBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 8192
) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    throw new ApiError(415, 'INVALID_CONTENT_TYPE', 'JSON is required.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return readJsonBody(new Request(request.url, { method: 'POST', body: bytes }), schema);
}
