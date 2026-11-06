import type { PrismaClient } from '@/generated/prisma/client';
import { loadPriceLists } from '@/data/load';
import { withCircularPrices } from '@/domain/circular/prices';
export async function loadCataloguePriceLists(db: PrismaClient) {
  const [lists, offers] = await Promise.all([loadPriceLists(), db.circularOffer.findMany()]);
  return withCircularPrices(lists, offers);
}
