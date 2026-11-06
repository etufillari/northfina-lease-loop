import {
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadRefurbishmentCosts,
  loadVatRates,
} from '@/data/load';
import type { PriceList } from '@/data/schemas';
import type { AssetRelease } from '@/generated/prisma/client';
import { listPriceOn } from '@/domain/price-list';
import { refurbishmentPlan } from '@/domain/lifecycle';
import { isAvailableForCustomer } from '@/domain/availability';
import { toAsset } from './assets';
import { ApiError } from './api-response';
import type { TransactionClient } from './audit';
import { requireCustomer, type DemoContext } from './demo-context';
import type { PrismaClient } from './prisma-client';
import { readMaintenance } from './spine-maintenance';

export type CatalogueOffer = { priceCents: number; source: string; releaseRevision: number };

function priceFor(
  assetId: string,
  onDate: string,
  release: AssetRelease | null,
  priceLists: readonly PriceList[]
): CatalogueOffer | null {
  if (release) {
    if (
      release.net_price_cents === null ||
      release.ready_on === null ||
      release.ready_on > onDate
    ) {
      return null;
    }
    return {
      priceCents: release.net_price_cents,
      source: `release:${release.revision}`,
      releaseRevision: release.revision,
    };
  }
  const price = listPriceOn(priceLists, assetId, onDate);
  return price.ok
    ? { priceCents: price.priceCents, source: `list:${price.priceListVersion}`, releaseRevision: 0 }
    : null;
}

/** Catalogue and quote creation use this same price precedence. */
export async function cataloguePrices(db: PrismaClient, onDate: string) {
  const [assets, releases, priceLists] = await Promise.all([
    db.asset.findMany(),
    db.assetRelease.findMany(),
    loadPriceLists(),
  ]);
  // Preserve first-match behavior; the database also makes asset_id unique.
  const releaseByAsset = new Map<string, AssetRelease>();
  for (const release of releases) {
    if (!releaseByAsset.has(release.asset_id)) releaseByAsset.set(release.asset_id, release);
  }
  return Object.fromEntries(
    assets.map((asset) => [
      asset.id,
      priceFor(asset.id, onDate, releaseByAsset.get(asset.id) ?? null, priceLists),
    ])
  ) as Record<string, CatalogueOffer | null>;
}

export async function readAssetOffer(
  db: PrismaClient | TransactionClient,
  assetId: string,
  onDate: string
) {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) throw new ApiError(404, 'ASSET_NOT_FOUND', 'The item was not found');
  const [release, priceLists] = await Promise.all([
    db.assetRelease.findUnique({ where: { asset_id: assetId } }),
    loadPriceLists(),
  ]);
  return { asset: toAsset(row), release, offer: priceFor(assetId, onDate, release, priceLists) };
}

export async function getBootstrap(db: PrismaClient, context: DemoContext, assetId: string) {
  requireCustomer(context);
  const [item, customers, coefficientTable, vatRates, questions, costs] = await Promise.all([
    readAssetOffer(db, assetId, context.businessDate),
    loadCustomers(),
    loadCoefficientTable(),
    loadVatRates(),
    loadQuestions(),
    loadRefurbishmentCosts(),
  ]);
  const maintenance = readMaintenance(item.release);
  return {
    businessDate: context.businessDate,
    simulated: context.simulated,
    customer: context.customer,
    customers: customers.map(({ id, name, type }) => ({ id, name, type })),
    asset: item.asset,
    offer: item.offer,
    releaseRevision: item.release?.revision ?? 0,
    refurbishmentCosts: costs,
    maintenance,
    reservedForSelectedCustomer: item.release?.reserved_for_customer_id === context.customer.id,
    availableForSelectedCustomer: isAvailableForCustomer({
      status: item.asset.status,
      offerReady: item.offer !== null,
      reservedForCustomerId: item.release?.reserved_for_customer_id ?? null,
      customerId: context.customer.id,
    }),
    coefficientTable,
    vatRates,
    questions: questions.questions,
    readiness:
      item.asset.status === 'returned'
        ? refurbishmentPlan({ asset: item.asset, targetCondition: 'good', costs, maintenance })
        : null,
  };
}
