// The item passport (scenario card 10): every AssetEvent of one asset across all its lives,
// plus the CO2 the current life avoids. CO2 per docs/DECISIONS.md:
//   manufacturing_new_kg × (1 − refurbishment_share_of_new) × remaining-value fraction,
// where the fraction is today's market value over the price-list v1 price.
import {
  loadCo2Factors,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
} from '@/data/load';
import type { Asset } from '@/data/schemas';
import { listPriceOn } from '@/domain/price-list';
import { ageInMonths, marketValueCents } from '@/domain/residual';
import { valueUsage } from '@/domain/usage';
import type { PrismaClient } from '@/generated/prisma/client';
import { toAsset } from './assets';
import { lifeCo2Kg, ORIGINAL_PRICE_DATE } from './second-life';

export type PassportEvent = {
  id: number;
  type: string;
  onDate: string;
  contractId: string | null;
  details: Record<string, unknown>;
};

export type PassportCo2 = {
  /** kg CO2e avoided by the life the asset is in now. */
  kg: number;
  marketValueCents: number;
  originalListPriceCents: number;
  remainingValueFraction: number;
  manufacturingNewKg: number;
  refurbishmentShareOfNew: number;
};

export type Passport = {
  asset: Asset;
  /** The life the asset is in: previous lives + 1. */
  currentLife: number;
  events: PassportEvent[];
  /** null when the asset has no v1 price to measure the remaining value against. */
  co2: PassportCo2 | null;
  /** kg recorded on each refurbishment, i.e. at the start of each documented life. */
  recordedLives: Array<{ life: number; onDate: string; co2AvoidedKg: number }>;
};

function parseDetails(json: string | null): Record<string, unknown> {
  if (json === null) return {};
  const value: unknown = JSON.parse(json);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function assetPassport(
  db: PrismaClient,
  assetId: string,
  asOf: string
): Promise<Passport | null> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return null;
  const asset = toAsset(row);

  const [rows, priceLists, curves, factors, costs] = await Promise.all([
    db.assetEvent.findMany({
      where: { asset_id: assetId },
      orderBy: [{ on_date: 'asc' }, { id: 'asc' }],
    }),
    loadPriceLists(),
    loadResidualCurves(),
    loadCo2Factors(),
    loadRefurbishmentCosts(),
  ]);
  const events = rows.map((event) => ({
    id: event.id,
    type: event.type,
    onDate: event.on_date,
    contractId: event.contract_id,
    details: parseDetails(event.details_json),
  }));

  let co2: PassportCo2 | null = null;
  const v1 = listPriceOn(priceLists, asset.id, ORIGINAL_PRICE_DATE);
  if (v1.ok) {
    const value = marketValueCents(
      {
        originalListPriceCents: v1.priceCents,
        category: asset.category,
        condition: asset.condition,
        usageValue: valueUsage(asset, costs),
        ageMonths: ageInMonths(asset.model_year, asOf),
      },
      curves
    );
    const life = lifeCo2Kg(
      { category: asset.category, valueCents: value, originalListPriceCents: v1.priceCents },
      factors
    );
    co2 = {
      kg: life.kg,
      marketValueCents: value,
      originalListPriceCents: v1.priceCents,
      remainingValueFraction: life.remainingValueFraction,
      manufacturingNewKg: factors.manufacturing_new_kg[asset.category] ?? 0,
      refurbishmentShareOfNew: factors.refurbishment_share_of_new,
    };
  }

  const recordedLives = events.flatMap((event) => {
    const { life, co2AvoidedKg } = event.details;
    return event.type === 'refurbished' &&
      typeof life === 'number' &&
      typeof co2AvoidedKg === 'number'
      ? [{ life, onDate: event.onDate, co2AvoidedKg }]
      : [];
  });

  return { asset, currentLife: asset.previous_lives + 1, events, co2, recordedLives };
}
