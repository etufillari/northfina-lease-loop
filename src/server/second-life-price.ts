// The second-life price of a relisted item (D12; D86: the market value after the plan), read by
// the quote and the signing: the latest assessment's financed amount replaces the asset's list
// price in every price list, so `priceQuote` puts it through the normal band and factor and the
// quote keeps the live list's version (it says which list was live; the amount is the
// assessment's). An item never assessed keeps its list price. An assessment stored before D86
// keeps its D12 amount until the item is re-assessed or the database reset. Kept apart from
// second-life.ts so quotes.ts can import it without a cycle (second-life.ts reads the pricing
// data through quotes.ts).
import type { PricingData } from '@/domain/pricing';
import { withSecondLifePrice } from '@/domain/second-life/assess';
import type { TransactionClient } from './audit';
import type { PrismaClient } from './prisma-client';

/** The latest assessment's second-life financed amount of one unit, or null. */
export async function secondLifePriceCents(
  db: PrismaClient | TransactionClient,
  assetId: string
): Promise<number | null> {
  const latest = await db.returnAssessment.findFirst({
    where: { asset_id: assetId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    select: { second_life_financed_cents: true },
  });
  return latest?.second_life_financed_cents ?? null;
}

/** `pricing` with the asset at its second-life price when it has one. */
export async function pricingForAsset(
  db: PrismaClient | TransactionClient,
  assetId: string,
  pricing: PricingData
): Promise<PricingData> {
  const cents = await secondLifePriceCents(db, assetId);
  return cents === null ? pricing : withSecondLifePrice(pricing, assetId, cents);
}
