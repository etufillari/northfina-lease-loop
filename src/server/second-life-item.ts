// An asset as the second-life valuation sees it (D-035, D-042): its category, age clock, current
// condition and usage, and its price at its first lease. Used for a returned item (second life)
// and for an item still out on lease that is being passed on (D-048).
import type { Asset, PriceList } from '@/data/schemas';
import { firstLeasePrice, type SecondLifeItem } from '@/domain/second-life';
import { toAsset } from './assets';
import { ageClockFor } from './item-age';
import type { PrismaClient } from './prisma-client';

export function asSecondLifeItem(
  asset: Asset,
  priceCents: number,
  firstLeasedNewOn: string | null
): SecondLifeItem {
  return {
    category: asset.category,
    modelYear: asset.model_year,
    firstLeasedNewOn,
    condition: asset.condition,
    usage: asset.usage,
    firstLeasePriceCents: priceCents,
  };
}

/** Null when the asset is missing or no price list knows it. */
export async function secondLifeItemFor(
  db: PrismaClient,
  priceLists: PriceList[],
  assetId: string
): Promise<SecondLifeItem | null> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return null;
  const asset = toAsset(row);
  const first = firstLeasePrice(priceLists, asset.id);
  if (!first) return null;
  const clock = await ageClockFor(db, asset.id);
  return asSecondLifeItem(asset, first.priceCents, clock?.firstLeasedNewOn ?? null);
}
