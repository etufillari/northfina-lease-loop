// The price lists every server-side quote and signing prices from. One place, so quotes, the
// price check and signing all see a re-listed item at its second-life price (D-034, D-035).
import type { PriceList } from '@/data/schemas';
import { priceListsWithListings } from './listed-prices';
import type { LeaseDataPack } from './lease-data';
import type { PrismaClient } from './prisma-client';

export async function pricingPriceLists(
  db: PrismaClient,
  data: Pick<LeaseDataPack, 'priceLists'>
): Promise<PriceList[]> {
  return priceListsWithListings(db, data.priceLists);
}
