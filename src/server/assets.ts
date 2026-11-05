// Reading and changing assets in the database. Rows are converted to the same `Asset`
// shape as data/assets.json, so the UI and domain code see one type everywhere.
import type { Asset as AssetRow, PrismaClient } from '@/generated/prisma/client';
import { assetSchema, type Asset, type AssetCategory, type AssetStatus } from '@/data/schemas';
import { withAudit } from './audit';

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
  db: PrismaClient,
  filter: { category?: AssetCategory } = {},
  now = new Date()
): Promise<Asset[]> {
  const rows = await db.asset.findMany({
    where: filter.category ? { category: filter.category } : {},
    orderBy: { id: 'asc' },
  });
  return rows.map((row) =>
    toAsset({
      ...row,
      status:
        row.status === 'reserved' && row.reserved_until !== null && row.reserved_until <= now
          ? 'available'
          : row.status,
    })
  );
}

export type ChangeAssetStatusResult =
  { ok: true; asset: Asset } | { ok: false; reason: 'not_found' };

export type ReserveAssetResult =
  | { ok: true; asset: Asset; reservedUntil: string }
  | { ok: false; reason: 'not_found' | 'unavailable' };

const RESERVATION_MINUTES = 15;

export async function reserveAsset(
  db: PrismaClient,
  input: { id: string; actor: string; now: Date }
): Promise<ReserveAssetResult> {
  const reservedUntil = new Date(input.now.getTime() + RESERVATION_MINUTES * 60_000);
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };

  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.reserved',
        entityType: 'asset',
        entityId: input.id,
        details: {
          from: existing.status,
          to: 'reserved',
          reservedUntil: reservedUntil.toISOString(),
        },
      },
      async (tx) => {
        const claimed = await tx.asset.updateMany({
          where: {
            id: input.id,
            OR: [
              { status: 'available' },
              { status: 'reserved', reserved_until: { lte: input.now } },
            ],
          },
          data: { status: 'reserved', reserved_until: reservedUntil, reserved_by: input.actor },
        });
        if (claimed.count !== 1) throw new ReservationUnavailableError();
        return tx.asset.findUniqueOrThrow({ where: { id: input.id } });
      }
    );
    return { ok: true, asset: toAsset(updated), reservedUntil: reservedUntil.toISOString() };
  } catch (error) {
    if (error instanceof ReservationUnavailableError) {
      return { ok: false, reason: 'unavailable' };
    }
    throw error;
  }
}

class ReservationUnavailableError extends Error {}

/** Sets an asset's status and writes `asset.status_changed` to the audit log, atomically. */
export async function changeAssetStatus(
  db: PrismaClient,
  input: { id: string; status: AssetStatus; actor: string }
): Promise<ChangeAssetStatusResult> {
  const existing = await db.asset.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, reason: 'not_found' };

  const updated = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.status_changed',
      entityType: 'asset',
      entityId: input.id,
      details: { from: existing.status, to: input.status },
    },
    (tx) => tx.asset.update({ where: { id: input.id }, data: { status: input.status } })
  );
  return { ok: true, asset: toAsset(updated) };
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
