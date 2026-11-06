import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { assetOfferPrice } from '@/domain/asset-offer';
import { toAsset } from './assets';
import { db } from './db';

export async function checkoutOptions(today: string) {
  const [assets, prices, table, vat] = await Promise.all([
    db.asset.findMany({
      where: { isFleetHistory: false },
      orderBy: { id: 'asc' },
      include: { contracts: { where: { status: 'active' }, select: { id: true } } },
    }),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const options = assets.flatMap((row) => {
    const asset = toAsset(row);
    const price = assetOfferPrice(row, prices, today);
    if (!price.ok) return [];
    return [
      {
        id: asset.id,
        category: asset.category,
        name: `${asset.make} ${asset.model}`,
        available: asset.status === 'available' && row.contracts.length === 0,
        priceCents: price.priceCents,
        priceListVersion: price.priceListVersion,
      },
    ];
  });
  return { options, table, rates: vat.rates, today };
}
export type CheckoutData = Awaited<ReturnType<typeof checkoutOptions>>;
