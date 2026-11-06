// Loads an item's passport (card 10, D-036): its contracts, their endings and its re-listings from
// the database, the item as the data pack received it, and builds the lives in the domain. Reads
// only.
import { loadAssets, loadCo2Factors, loadResidualCurves } from '@/data/load';
import { assetConditionSchema, type Asset } from '@/data/schemas';
import {
  buildPassport,
  type Passport,
  type PassportContract,
  type PassportListing,
} from '@/domain/passport';
import { toAsset } from './assets';
import { getContractEnding } from './contract-endings';
import { getContract } from './contracts';
import type { PrismaClient } from './prisma-client';

export interface PassportView {
  asset: Asset;
  passport: Passport;
}

async function contractsFor(db: PrismaClient, assetId: string): Promise<PassportContract[]> {
  const rows = await db.contract.findMany({
    // A lease still waiting for its signature isn't one of the item's lives yet (D-053).
    where: { asset_id: assetId, status: 'active' },
    orderBy: { id: 'asc' },
    select: { id: true, created_at: true },
  });
  return Promise.all(
    rows.map(async (row) => {
      const [found, ending] = await Promise.all([
        getContract(db, row.id),
        getContractEnding(db, row.id),
      ]);
      if (!found) throw new Error(`contract ${row.id} disappeared while loading`);
      const { contract } = found;
      return {
        id: row.id,
        recordedAt: row.created_at.toISOString(),
        customerId: contract.customerId,
        signDate: contract.signDate,
        startDate: contract.startDate,
        termMonths: contract.termMonths,
        listPriceCents: contract.listPriceCents,
        monthlyNetRentCents: contract.monthlyNetRentCents,
        ending: ending
          ? {
              kind: ending.kind,
              effectiveDate: ending.effectiveDate,
              inspection: ending.inspection ?? null,
            }
          : null,
      };
    })
  );
}

async function listingsFor(db: PrismaClient, assetId: string): Promise<PassportListing[]> {
  const rows = await db.secondLifeListing.findMany({
    where: { asset_id: assetId },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    recordedAt: row.created_at.toISOString(),
    listedOn: row.listed_on,
    before: {
      condition: assetConditionSchema.parse(row.condition_before),
      usageValue: row.usage_before,
    },
    after: {
      condition: assetConditionSchema.parse(row.condition_after),
      usageValue: row.usage_after,
    },
    refurbishmentCents: row.refurbishment_cents,
    listPriceCents: row.list_price_cents,
  }));
}

/** The passport of one item, or null when the item doesn't exist. */
export async function passportView(
  db: PrismaClient,
  assetId: string
): Promise<PassportView | null> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return null;
  const asset = toAsset(row);
  const [factors, curves, dataPackAssets, contracts, listings] = await Promise.all([
    loadCo2Factors(),
    loadResidualCurves(),
    loadAssets(),
    contractsFor(db, assetId),
    listingsFor(db, assetId),
  ]);
  // An item added outside the data pack is taken as received in its current state.
  const received = dataPackAssets.find((a) => a.id === assetId) ?? asset;
  const passport = buildPassport(
    { factors, curves },
    {
      category: asset.category,
      modelYear: asset.model_year,
      previousLives: asset.previous_lives,
      received: {
        status: received.status,
        condition: received.condition,
        usageValue: received.usage.value,
      },
    },
    contracts,
    listings
  );
  return { asset, passport };
}
