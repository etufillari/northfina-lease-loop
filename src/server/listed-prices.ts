// Re-listed items' second-life prices (D-035). Kept apart from second-life.ts so signing and the
// catalogue can price from it without importing the whole second-life module.
import type { PriceList } from '@/data/schemas';
import { withListedPrices } from '@/domain/second-life';
import type { PrismaClient } from './prisma-client';

/** Each re-listed asset's current second-life price: the latest listing wins. */
export async function listedPrices(db: PrismaClient): Promise<Record<string, number>> {
  const rows = await db.secondLifeListing.findMany({
    orderBy: { id: 'asc' },
    select: { asset_id: true, list_price_cents: true },
  });
  return Object.fromEntries(rows.map((row) => [row.asset_id, row.list_price_cents]));
}

/** The asset's latest re-listing, or null when it never had one. */
export async function latestListing(db: PrismaClient, assetId: string) {
  return db.secondLifeListing.findFirst({
    where: { asset_id: assetId },
    orderBy: { id: 'desc' },
    select: { listed_on: true, refurbishment_cents: true, list_price_cents: true },
  });
}

/** The price lists with every re-listed item at its second-life price. */
export async function priceListsWithListings(
  db: PrismaClient,
  priceLists: PriceList[]
): Promise<PriceList[]> {
  return withListedPrices(priceLists, await listedPrices(db));
}
