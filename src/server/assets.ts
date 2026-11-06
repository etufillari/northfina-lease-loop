// Reading and changing assets in the database. Rows are converted to the same `Asset`
// shape as data/assets.json, so the UI and domain code see one type everywhere.
import type { Asset as AssetRow, PrismaClient } from '@/generated/prisma/client';
import {
  assetConditionSchema,
  assetSchema,
  assetStatusSchema,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type AssetStatus,
} from '@/data/schemas';
import {
  checkAssetStatusChange,
  checkManualAssetStatusChange,
  type ManualAssetStatusChangeRefusal,
} from '@/domain/catalogue/transitions';
import type { AuthzRefusal } from '@/domain/authz/policy';
import { withAudit, type TransactionClient } from './audit';
import { authorize } from './authorize';

/** Database row → data-pack shape. Validates, so a bad value edited in by hand is caught. */
export function toAsset(row: AssetRow): Asset {
  return assetSchema.parse({
    id: row.id,
    category: row.category,
    make: row.make,
    model: row.model,
    model_year: row.model_year,
    serial_number: row.serial_number,
    condition: row.condition,
    usage: { unit: row.usage_unit, value: row.usage_value },
    previous_lives: row.previous_lives,
    status: row.status,
  });
}

/** Data-pack shape → columns for a new database row. */
export function toAssetRowData(asset: Asset) {
  return {
    id: asset.id,
    category: asset.category,
    make: asset.make,
    model: asset.model,
    model_year: asset.model_year,
    serial_number: asset.serial_number,
    condition: asset.condition,
    usage_unit: asset.usage.unit,
    usage_value: asset.usage.value,
    previous_lives: asset.previous_lives,
    status: asset.status,
  };
}

export async function listAssets(
  db: PrismaClient | TransactionClient,
  filter: { category?: AssetCategory } = {}
): Promise<Asset[]> {
  const rows = await db.asset.findMany({
    where: filter.category ? { category: filter.category } : {},
    orderBy: { id: 'asc' },
  });
  return rows.map(toAsset);
}

/** One asset by id, or null. The read other slices use for a single asset (team rule 3). */
export async function getAsset(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<Asset | null> {
  const row = await db.asset.findUnique({ where: { id } });
  return row ? toAsset(row) : null;
}

export type ChangeAssetStatusResult =
  | { ok: true; asset: Asset }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden'; refusal: AuthzRefusal }
  | { ok: false; reason: ManualAssetStatusChangeRefusal };

/** Thrown inside the transaction when another request changed the status first. */
class LostStatusRace extends Error {}

/**
 * The admin's manual status change (`PATCH /api/assets/:id/status`). Only `admin` may make
 * it; the actor comes from the server's actor cookie, never from the body. The change must be
 * one of D22's transitions (`checkAssetStatusChange`, parsed before any write); a refusal is a
 * code with both statuses. The status and `asset.status_changed` are written in one
 * transaction, and the update only applies while the status is still the one checked, so a
 * concurrent change makes this one a refusal, not a skipped transition.
 */
export async function changeAssetStatus(
  db: PrismaClient,
  input: { id: string; status: AssetStatus; actor: string }
): Promise<ChangeAssetStatusResult> {
  const status = assetStatusSchema.parse(input.status);
  // D73: authorized before anything is read.
  const auth = await authorize(db, input.actor, 'set_asset_status', { none: true });
  if (!auth.ok && auth.reason.code !== 'not_found') {
    return { ok: false, reason: 'forbidden', refusal: auth.reason };
  }
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };
  // Product review 4: by hand only available ⇄ reserved; the rest follows a contract.
  const check = checkManualAssetStatusChange(existing.status, status);
  if (!check.ok) return { ok: false, reason: check.reason };

  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.status_changed',
        entityType: 'asset',
        entityId: input.id,
        details: { from: existing.status, to: status },
      },
      async (tx) => {
        const { count } = await tx.asset.updateMany({
          where: { id: input.id, status: existing.status },
          data: { status },
        });
        if (count === 0) throw new LostStatusRace();
        return tx.asset.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
    return { ok: true, asset: toAsset(updated) };
  } catch (error) {
    if (!(error instanceof LostStatusRace)) throw error;
    // Another change won: report the status it left, so the admin sees why.
    const now = await db.asset.findUniqueOrThrow({ where: { id: input.id } });
    const from = assetStatusSchema.parse(now.status);
    return { ok: false, reason: { code: 'transition_not_allowed', params: { from, to: status } } };
  }
}

/** Inserts assets that are not in the database yet. Never overwrites changes you made. */
export async function seedAssets(
  db: PrismaClient,
  assets: readonly Asset[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.asset.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = assets.filter((asset) => !existingIds.has(asset.id));
  if (missing.length > 0) {
    await db.asset.createMany({ data: missing.map(toAssetRowData) });
  }
  return { created: missing.length, skipped: assets.length - missing.length };
}

/** Thrown inside the caller's transaction when the asset is no longer `returned`. */
export class AssetNotReturnedError extends Error {
  constructor(readonly assetId: string) {
    super(`Asset ${assetId} is not returned`);
    this.name = 'AssetNotReturnedError';
  }
}

/**
 * The second life's relisting (D22: `returned` → `available`), on the caller's `tx`: the
 * condition and usage after the refurbishment plan. The transition is checked with
 * `checkAssetStatusChange` and the values parsed before the write (D23); the write applies only
 * while the asset is still `returned`, else it throws so the whole assessment rolls back.
 */
export async function relistReturnedAsset(
  tx: TransactionClient,
  input: { assetId: string; condition: AssetCondition; usageValue: number }
): Promise<void> {
  const from = assetStatusSchema.parse('returned');
  const to = assetStatusSchema.parse('available');
  const check = checkAssetStatusChange(from, to);
  if (!check.ok) throw new Error(`relisting is not a D22 transition: ${check.reason.code}`);
  if (!Number.isSafeInteger(input.usageValue) || input.usageValue < 0) {
    throw new RangeError(`usage must be a whole number ≥ 0, got ${input.usageValue}`);
  }
  const { count } = await tx.asset.updateMany({
    where: { id: input.assetId, status: from },
    data: {
      status: to,
      condition: assetConditionSchema.parse(input.condition),
      usage_value: input.usageValue,
    },
  });
  if (count !== 1) throw new AssetNotReturnedError(input.assetId);
}

/**
 * D90: holds the item a pass-on relisted for the customer it named (D22: `available` →
 * `reserved`), on the caller's `tx`, so it leaves the public catalogue and nobody else can quote
 * or sign it. The named customer's quote leases it from `reserved` (catalogue-handlers.ts).
 */
export async function reserveAvailableAsset(tx: TransactionClient, assetId: string): Promise<void> {
  const from = assetStatusSchema.parse('available');
  const to = assetStatusSchema.parse('reserved');
  const check = checkAssetStatusChange(from, to);
  if (!check.ok) throw new Error(`reserving is not a D22 transition: ${check.reason.code}`);
  const { count } = await tx.asset.updateMany({
    where: { id: assetId, status: from },
    data: { status: to },
  });
  if (count !== 1) throw new Error(`Asset ${assetId} is no longer available to reserve`);
}
