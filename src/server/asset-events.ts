// The asset event log (the passport's source, docs/kickoff-brief.md section 6: the second-life
// slice owns `AssetEvent`). Writes take the `tx` of the caller's `withAudit`, so an event is
// logged with the change that caused it or not at all. The order of the log is the id.
import { z } from 'zod';
import { loadCo2Factors, loadPriceLists, loadRefurbishmentCosts } from '@/data/load';
import { isoDateSchema, type Asset, type RefurbishmentCosts } from '@/data/schemas';
import { passportFor, type Passport, type PassportEvent } from '@/domain/passport';
import { listPriceOn } from '@/domain/price-list';
import {
  co2Method,
  co2SavedForAsset,
  fleetImpact,
  type AssetCo2,
  type FleetImpact,
} from '@/domain/second-life/co2';
import {
  fleetMoneySaved,
  mandatoryRefurbishmentCents,
  moneySavedForAsset,
  refurbishmentByLife,
  type AssetMoney,
  type FleetMoney,
} from '@/domain/second-life/money-saved';
import { assetEventKindSchema } from '@/domain/statuses';
import type { TransactionClient } from './audit';
import { listAssets } from './assets';
import type { PrismaClient } from './prisma-client';

export const appendAssetEventSchema = z.strictObject({
  assetId: z.string().min(1),
  contractId: z.string().min(1).optional(),
  kind: assetEventKindSchema,
  onDate: isoDateSchema,
  details: z.record(z.string(), z.unknown()).default({}),
});
export type AppendAssetEvent = z.input<typeof appendAssetEventSchema>;

type EventRow = {
  id: number;
  kind: string;
  on_date: string;
  contract_id: string | null;
  details_json: string;
};

const toPassportEvent = (row: EventRow): PassportEvent => ({
  id: row.id,
  kind: assetEventKindSchema.parse(row.kind),
  on_date: row.on_date,
  contract_id: row.contract_id,
  details: JSON.parse(row.details_json) as unknown,
});

/** Appends one event to an asset's log. Validates first; an unknown kind throws. */
export async function appendAssetEvent(
  tx: TransactionClient,
  input: AppendAssetEvent
): Promise<PassportEvent> {
  const event = appendAssetEventSchema.parse(input);
  const row = await tx.assetEvent.create({
    data: {
      asset_id: event.assetId,
      contract_id: event.contractId ?? null,
      kind: event.kind,
      on_date: event.onDate,
      details_json: JSON.stringify(event.details),
    },
  });
  return toPassportEvent(row);
}

/** An asset's events in the order they were written. */
export async function listAssetEvents(
  db: PrismaClient | TransactionClient,
  assetId: string
): Promise<PassportEvent[]> {
  const rows = await db.assetEvent.findMany({
    where: { asset_id: assetId },
    orderBy: { id: 'asc' },
  });
  return rows.map(toPassportEvent);
}

export type AssetPassport = {
  asset: Asset;
  passport: Passport;
  co2: AssetCo2;
  /** The money its later lives saved, at the item's list price as new on `asOf` (D80). */
  money: AssetMoney;
};

/** The item's net list price as new on the day, or null when no list prices it. */
const newPriceOn = (
  priceLists: Parameters<typeof listPriceOn>[0],
  assetId: string,
  asOf: string
) => {
  const price = listPriceOn(priceLists, assetId, asOf);
  return price.ok ? price.priceCents : null;
};

/** An asset, its lives as on `asOf` and the CO2 and money they saved; null when there is no such asset. */
export async function readPassport(
  db: PrismaClient,
  assetId: string,
  asOf: string
): Promise<AssetPassport | null> {
  const asset = (await listAssets(db)).find((candidate) => candidate.id === assetId);
  if (!asset) return null;
  const [events, factors, priceLists, costs] = await Promise.all([
    listAssetEvents(db, assetId),
    loadCo2Factors(),
    loadPriceLists(),
    loadRefurbishmentCosts(),
  ]);
  const passport = passportFor(asset, events, asOf);
  const method = co2Method(factors);
  const lives = livesWithCosts(passport, costs, asset.category);
  const co2 = co2SavedForAsset(method, { category: asset.category, lives });
  const money = moneySavedForAsset(method, {
    category: asset.category,
    newPriceCents: newPriceOn(priceLists, asset.id, asOf),
    lives,
  });
  return { asset, passport, co2, money };
}

/** Each life's months and what getting the item ready for it cost (D80). */
function livesWithCosts(
  passport: Passport,
  costs: RefurbishmentCosts,
  category: Asset['category']
): { months: number; refurbishmentCents: number }[] {
  const spent = refurbishmentByLife(passport.lives, mandatoryRefurbishmentCents(costs, category));
  return passport.lives.map((life, index) => ({
    months: life.months ?? 0,
    refurbishmentCents: spent[index]!,
  }));
}

export type FleetImpactRead = {
  fleet: FleetImpact;
  /** The money the same lives saved, per category (D80). */
  money: FleetMoney;
  /** The items with a life after their first, with what each saved, most first. */
  assets: { asset: Asset; kg: number }[];
};

/** The whole fleet's CO2 and money saved as on `asOf`, from the past lives and the event log. */
export async function readFleetImpact(db: PrismaClient, asOf: string): Promise<FleetImpactRead> {
  const [assets, rows, factors, priceLists, costs] = await Promise.all([
    listAssets(db),
    db.assetEvent.findMany({ orderBy: { id: 'asc' } }),
    loadCo2Factors(),
    loadPriceLists(),
    loadRefurbishmentCosts(),
  ]);
  const byAsset = new Map<string, PassportEvent[]>();
  for (const row of rows) {
    byAsset.set(row.asset_id, [...(byAsset.get(row.asset_id) ?? []), toPassportEvent(row)]);
  }
  const method = co2Method(factors);
  const lived = assets.map((asset) => ({
    asset,
    category: asset.category,
    newPriceCents: newPriceOn(priceLists, asset.id, asOf),
    lives: livesWithCosts(
      passportFor(asset, byAsset.get(asset.id) ?? [], asOf),
      costs,
      asset.category
    ),
  }));
  return {
    fleet: fleetImpact(method, lived),
    money: fleetMoneySaved(method, lived),
    assets: lived
      .filter((item) => item.lives.length > 1)
      .map((item) => ({ asset: item.asset, kg: co2SavedForAsset(method, item).totalKg }))
      .sort((a, b) => b.kg - a.kg || a.asset.id.localeCompare(b.asset.id)),
  };
}
