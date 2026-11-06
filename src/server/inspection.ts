// The return inspection (docs/DECISIONS.md): when an item comes back from a lease, staff grade
// its condition at the second-life desk before the decision. The grade is pre-filled from the
// rule in src/domain/inspection.ts (how it went out, how much it was used), so accepting it is
// one click — executing the card records the suggestion as the inspection. Data-pack items
// that arrive already `returned` were graded by the data pack and need no inspection.
import { assetConditionSchema, type AssetCondition } from '@/data/schemas';
import {
  isAllowedInspection,
  suggestReturnCondition,
  WEAR_STEP,
  type ConditionSuggestion,
} from '@/domain/inspection';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit, type TransactionClient } from './audit';

type Reader = PrismaClient | TransactionClient;

export type ReturnInspection = {
  /** True until someone (or the desk's execute) has graded this return. */
  needed: boolean;
  /** The condition it went out in: the best grade an inspection may give. */
  conditionOut: AssetCondition;
  usedDuringLease: number;
  /** One grade per this much use (km, battery cycles, engine hours). */
  wearStep: number;
  suggested: ConditionSuggestion;
  /** The grade given, once inspected. */
  inspected: AssetCondition | null;
};

function details(json: string | null): Record<string, unknown> {
  const value: unknown = json ? JSON.parse(json) : null;
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const asCondition = (value: unknown): AssetCondition | null => {
  const parsed = assetConditionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** The inspection state of a returned item, or null when it came back without a recorded return. */
export async function returnInspection(
  db: Reader,
  asset: { id: string; category: string; condition: string }
): Promise<ReturnInspection | null> {
  const returned = await db.assetEvent.findFirst({
    where: { asset_id: asset.id, type: 'returned' },
    orderBy: [{ on_date: 'desc' }, { id: 'desc' }],
  });
  if (!returned) return null;
  const refurbishedSince = await db.assetEvent.findFirst({
    where: { asset_id: asset.id, type: 'refurbished', id: { gt: returned.id } },
  });
  if (refurbishedSince) return null;
  const inspectedEvent = await db.assetEvent.findFirst({
    where: { asset_id: asset.id, type: 'inspected', id: { gt: returned.id } },
    orderBy: { id: 'desc' },
  });
  const d = details(returned.details_json);
  const category = asset.category as keyof typeof WEAR_STEP;
  const conditionOut = asCondition(d.conditionOut) ?? asCondition(asset.condition) ?? 'good';
  const usedDuringLease = typeof d.usageAdded === 'number' ? d.usageAdded : 0;
  return {
    needed: inspectedEvent === null,
    conditionOut,
    usedDuringLease,
    wearStep: WEAR_STEP[category],
    suggested: suggestReturnCondition({ category, conditionOut, usedDuringLease }),
    inspected: inspectedEvent ? asCondition(details(inspectedEvent.details_json).condition) : null,
  };
}

/** Writes an inspection (inside the caller's transaction): the grade and the passport event. */
export async function recordInspection(
  tx: TransactionClient,
  input: { assetId: string; condition: AssetCondition; inspection: ReturnInspection; asOf: string }
) {
  await tx.asset.update({ where: { id: input.assetId }, data: { condition: input.condition } });
  await tx.assetEvent.create({
    data: {
      asset_id: input.assetId,
      type: 'inspected',
      on_date: input.asOf,
      details_json: JSON.stringify({
        condition: input.condition,
        suggested: input.inspection.suggested.condition,
        conditionOut: input.inspection.conditionOut,
        usedDuringLease: input.inspection.usedDuringLease,
      }),
    },
  });
}

export type InspectResult =
  | { ok: true; condition: AssetCondition }
  | { ok: false; reason: 'not_found' | 'not_returned' | 'no_return' | 'better_than_out' };

/** Staff grade a returned item. It may be graded as it went out or worse, never better. */
export async function inspectReturn(
  db: PrismaClient,
  input: { assetId: string; condition: AssetCondition; actor: string; asOf: string }
): Promise<InspectResult> {
  const asset = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, reason: 'not_found' };
  if (asset.status !== 'returned') return { ok: false, reason: 'not_returned' };
  const inspection = await returnInspection(db, asset);
  if (!inspection) return { ok: false, reason: 'no_return' };
  if (!isAllowedInspection(inspection.conditionOut, input.condition)) {
    return { ok: false, reason: 'better_than_out' };
  }
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.inspected',
      entityType: 'asset',
      entityId: asset.id,
      details: {
        condition: input.condition,
        suggested: inspection.suggested.condition,
        conditionOut: inspection.conditionOut,
      },
    },
    (tx) =>
      recordInspection(tx, {
        assetId: asset.id,
        condition: input.condition,
        inspection,
        asOf: input.asOf,
      })
  );
  return { ok: true, condition: input.condition };
}
