import { z } from 'zod';
import type { AssetRelease } from '@/generated/prisma/client';
import { matchingSelectionSchema } from '@/data/second-life-schemas';

const meter = z.number().int().nonnegative();
export const readinessRecordSchema = z.strictObject({
  matching: matchingSelectionSchema.optional(),
  tasks: z.array(
    z.strictObject({
      id: z.string(),
      netCostCents: meter,
      units: meter,
      resetsUsage: z.boolean(),
    })
  ),
  totalNetCents: meter,
  usageBefore: meter,
  maintenance: z.strictObject({
    batteryReplacementAtUsage: meter.optional(),
    lastServiceAtUsage: meter.optional(),
  }),
});

export function readMaintenance(release: AssetRelease | null) {
  if (!release?.readiness_json) return {};
  return readinessRecordSchema.parse(JSON.parse(release.readiness_json)).maintenance;
}
