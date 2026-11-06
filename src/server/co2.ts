// Circular impact on the app's date, per item (its passport) and for the whole fleet.
// The method is explained in src/domain/co2.ts.
import { loadCo2Factors, loadPriceLists, loadResidualCurves } from '@/data/load';
import type { Co2Factors, PriceList, ResidualCurves } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  co2Impact,
  fleetImpact,
  lifeLeftShare,
  type Co2Impact,
  type FleetImpact,
} from '@/domain/co2';
import { ageInMonths } from '@/domain/second-life';
import { assetsOn, type AssetOn } from './asset-state';

export type ItemImpact = Co2Impact & { lifeLeft: number };

type Inputs = { factors: Co2Factors; curves: ResidualCurves; firstPrices: PriceList['prices'] };

async function inputs(): Promise<Inputs> {
  const [factors, curves, lists] = await Promise.all([
    loadCo2Factors(),
    loadResidualCurves(),
    loadPriceLists(),
  ]);
  const first = [...lists].sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
  return { factors, curves, firstPrices: first?.prices ?? {} };
}

function impactOf(item: AssetOn, today: string, { factors, curves, firstPrices }: Inputs) {
  const asset = item.asset;
  const lifeLeft = lifeLeftShare(curves, {
    category: asset.category,
    ageMonths: ageInMonths(asset.model_year, today),
    condition: asset.condition,
    usage: asset.usage.value,
  });
  const impact = co2Impact(factors, {
    category: asset.category,
    previousLives: asset.previous_lives,
    leasedNow: asset.status === 'leased',
    lifeLeft,
    // The first price list's price is the item's price at its first lease, as for its value.
    newPriceCents: firstPrices[asset.id] ?? null,
    km: asset.usage.unit === 'km' ? asset.usage.value : null,
  });
  return { ...impact, lifeLeft };
}

/** One item's impact on `today` (the item as assetOn returns it). */
export async function itemImpact(item: AssetOn, today: string): Promise<ItemImpact> {
  return impactOf(item, today, await inputs());
}

/** The whole fleet's impact on `today`. */
export async function fleetImpactOn(db: PrismaClient, today: string): Promise<FleetImpact> {
  const [items, data] = await Promise.all([assetsOn(db, today), inputs()]);
  return fleetImpact(items.map((item) => impactOf(item, today, data)));
}
