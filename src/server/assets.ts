// Reading and seeding assets in the database. A status changes only through signing, ending
// and re-listing, each audited (D-038). Rows are converted to the same `Asset`
// shape as data/assets.json, so the UI and domain code see one type everywhere.
import type { Asset as AssetRow, PrismaClient } from '@/generated/prisma/client';
import { assetSchema, type Asset, type AssetCategory } from '@/data/schemas';
import { parseStoredValue } from './stored-row';

/** Database row → data-pack shape. Validates, so a value edited in by hand is a 500 (D-038). */
export function toAsset(row: AssetRow): Asset {
  return parseStoredValue(
    assetSchema,
    {
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
    },
    { table: 'asset', id: row.id }
  );
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
  filter: { category?: AssetCategory } = {}
): Promise<Asset[]> {
  const rows = await db.asset.findMany({
    where: filter.category ? { category: filter.category } : {},
    orderBy: { id: 'asc' },
  });
  return rows.map(toAsset);
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
