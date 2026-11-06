import { loadCo2Factors, loadPriceLists, loadResidualCurves } from '@/data/load';
import { isoDateSchema, type Asset } from '@/data/schemas';
import {
  circularImpactFor,
  fleetCircularImpactFor,
  type CircularImpact,
  type CircularImpactFailureReason,
  type FleetCircularImpact,
} from '@/domain/circular-impact';
import { toAsset } from './assets';
import type { PrismaClient } from './prisma-client';
import { z } from 'zod';

export const circularImpactQuerySchema = z.strictObject({ asOf: isoDateSchema });
export type CircularImpactQuery = z.infer<typeof circularImpactQuerySchema>;

export type CircularImpactServiceFailure =
  { ok: false; reason: 'asset_not_found' } | { ok: false; reason: CircularImpactFailureReason };

export type AssetCircularImpactResult =
  { ok: true; asset: Asset; impact: CircularImpact } | CircularImpactServiceFailure;

export type FleetCircularImpactResult = { ok: true; impact: FleetCircularImpact };

async function loadImpactData() {
  const [priceLists, residualCurves, factors] = await Promise.all([
    loadPriceLists(),
    loadResidualCurves(),
    loadCo2Factors(),
  ]);
  return { priceLists, residualCurves, factors };
}

/** Calculates one asset's circular impact without changing database state. */
export async function getAssetCircularImpact(
  db: PrismaClient,
  assetId: string,
  input: CircularImpactQuery
): Promise<AssetCircularImpactResult> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return { ok: false, reason: 'asset_not_found' };

  const data = await loadImpactData();
  const result = circularImpactFor(
    toAsset(row),
    data.priceLists,
    data.residualCurves,
    data.factors,
    input.asOf
  );
  if (!result.ok) return result;
  return { ok: true, asset: toAsset(row), impact: result.impact };
}

/** Calculates impact for every known asset and transparently reports excluded rows. */
export async function getFleetCircularImpact(
  db: PrismaClient,
  input: CircularImpactQuery
): Promise<FleetCircularImpactResult> {
  const [assets, data] = await Promise.all([loadAssetsFromDatabase(db), loadImpactData()]);
  return {
    ok: true,
    impact: fleetCircularImpactFor(
      assets,
      data.priceLists,
      data.residualCurves,
      data.factors,
      input.asOf
    ),
  };
}

async function loadAssetsFromDatabase(db: PrismaClient): Promise<Asset[]> {
  const rows = await db.asset.findMany({ orderBy: { id: 'asc' } });
  return rows.map(toAsset);
}
