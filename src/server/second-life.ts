// Second life (Spine step 7, D-035): value a returned item, plan its refurbishment, match it to the
// waiting list, and put it back on the market at its second-life price. The relisting, the asset
// change and the audit row commit together; earlier contracts are never touched.
import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import {
  type Asset,
  type AssetCondition,
  type PriceList,
  type SecondLifeRequest,
} from '@/data/schemas';
import {
  firstLeasePrice,
  relistTargets,
  secondLifeRentFor,
  valueSecondLife,
  type SecondLifeData,
  type SecondLifeItem,
  type SecondLifeOption,
} from '@/domain/second-life';
import { inSignupOrder, matchWaitingList, type MatchResult } from '@/domain/waiting-list';
import { toAsset } from './assets';
import { withAudit } from './audit';
import { getContractEnding } from './contract-endings';
import type { PrismaClient } from './prisma-client';

export interface SecondLifeDataPack extends SecondLifeData {
  priceLists: PriceList[];
  demand: SecondLifeRequest[];
}

export async function loadSecondLifeDataPack(): Promise<SecondLifeDataPack> {
  const [curves, costs, table, priceLists, demand] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadPriceLists(),
    loadSecondLifeDemand(),
  ]);
  return { curves, costs, table, priceLists, demand };
}

export interface SecondLifeView {
  asset: Asset;
  /** The earliest price list stands in for the price at its first lease (D-035). */
  firstLeasePriceListVersion: number;
  /** Who the last lessee passed it on to (D-029): they get first claim. */
  passedOnTo: string | null;
  match: MatchResult;
  options: SecondLifeOption[];
  /** The option the top waiting-list match needs, or the cheapest one. */
  suggested: AssetCondition;
}

function returnedItem(asset: Asset, priceCents: number): SecondLifeItem {
  return {
    category: asset.category,
    modelYear: asset.model_year,
    condition: asset.condition,
    usage: asset.usage,
    firstLeasePriceCents: priceCents,
  };
}

/** The pass-on ending of the asset's latest contract, if that is how it came back. */
async function passedOnTo(db: PrismaClient, assetId: string): Promise<string | null> {
  const latest = await db.contract.findFirst({
    where: { asset_id: assetId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  if (!latest) return null;
  const ending = await getContractEnding(db, latest.id);
  return ending?.kind === 'pass_on' ? (ending.nextLessee ?? null) : null;
}

/**
 * Everything the returned item's page shows: the waiting list ranked for it and, for every
 * condition it may be re-listed at, the valuation, the refurbishment plan and the new rents.
 * Null when the asset is not `returned` or has no price to start from.
 */
export async function secondLifeView(
  db: PrismaClient,
  data: SecondLifeDataPack,
  assetId: string,
  today: string
): Promise<SecondLifeView | null> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row || row.status !== 'returned') return null;
  const asset = toAsset(row);
  const first = firstLeasePrice(data.priceLists, asset.id);
  if (!first) return null;
  const item = returnedItem(asset, first.priceCents);
  const rentFor = secondLifeRentFor(data, item, today);

  // No refurbishment duration in the data: the item is ready the day it is re-listed (D-035).
  const match = matchWaitingList({
    item,
    availableOn: today,
    entries: inSignupOrder(data.demand),
    costs: data.costs,
    rentFor,
  });
  const fairAccepted = match.ranked.some((m) => m.plan.conditionAfter === 'fair');
  const terms = Object.keys(data.table.end_of_term_buyout_percent_of_financed).map(Number);
  const options: SecondLifeOption[] = [];
  for (const target of relistTargets(asset.condition, fairAccepted)) {
    const valuation = valueSecondLife(data, item, target, today);
    if (!valuation.ok) continue;
    options.push({
      target,
      valuation,
      rents: terms.map((termMonths) => ({
        termMonths,
        monthlyNetRentCents: rentFor(target, termMonths),
      })),
    });
  }
  const top = match.ranked[0]?.plan.conditionAfter;
  const suggested = options.find((o) => o.target === top)?.target ?? options[0]?.target;
  if (!suggested) return null;

  return {
    asset,
    firstLeasePriceListVersion: first.priceListVersion,
    passedOnTo: await passedOnTo(db, asset.id),
    match,
    options,
    suggested,
  };
}

export interface RelistInput {
  assetId: string;
  target: AssetCondition;
  today: string;
  actor: string;
}

/** Every reason `relistAsset` refuses; `POST /api/assets/:id/relist` answers each in upper case. */
export type RelistRefusal = 'asset_not_found' | 'asset_not_returned' | 'target_not_allowed';

export type RelistResult =
  | { ok: true; asset: Asset; listingId: number; valuation: SecondLifeOption['valuation'] }
  | { ok: false; reason: RelistRefusal };

/** Thrown inside the transaction to roll it back when the asset changed meanwhile. */
class AssetChangedError extends Error {}

/**
 * Refurbishes the item to `target`, records its second-life price and makes it `available`, all
 * in one audited transaction. The server values it again; nothing from the browser is trusted.
 * `previous_lives` is not touched: the ending already counted the finished life (D-029).
 */
export async function relistAsset(
  db: PrismaClient,
  data: SecondLifeDataPack,
  input: RelistInput
): Promise<RelistResult> {
  const exists = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!exists) return { ok: false, reason: 'asset_not_found' };
  const view = await secondLifeView(db, data, input.assetId, input.today);
  if (!view) return { ok: false, reason: 'asset_not_returned' };
  const option = view.options.find((o) => o.target === input.target);
  if (!option) return { ok: false, reason: 'target_not_allowed' };
  const { valuation } = option;

  try {
    const listing = await withAudit(
      db,
      (created: { id: number }) => ({
        actor: input.actor,
        action: 'asset.relisted',
        entityType: 'asset',
        entityId: input.assetId,
        details: {
          listingId: created.id,
          from: {
            condition: valuation.asReturned.condition,
            usage: valuation.asReturned.usageValue,
          },
          to: { condition: valuation.after.condition, usage: valuation.after.usageValue },
          refurbishmentCents: valuation.refurbishmentCents,
          listPriceCents: valuation.listPriceCents,
          asOf: input.today, // D-030
        },
      }),
      async (tx) => {
        const changed = await tx.asset.updateMany({
          where: { id: input.assetId, status: 'returned' },
          data: {
            status: 'available',
            condition: valuation.after.condition,
            usage_value: valuation.after.usageValue,
          },
        });
        if (changed.count !== 1) throw new AssetChangedError();
        return tx.secondLifeListing.create({
          data: {
            asset_id: input.assetId,
            listed_on: input.today,
            condition_before: valuation.asReturned.condition,
            usage_before: valuation.asReturned.usageValue,
            condition_after: valuation.after.condition,
            usage_after: valuation.after.usageValue,
            refurbishment_cents: valuation.refurbishmentCents,
            list_price_cents: valuation.listPriceCents,
            valuation_json: JSON.stringify(valuation),
          },
        });
      }
    );
    const asset = toAsset(await db.asset.findUniqueOrThrow({ where: { id: input.assetId } }));
    return { ok: true, asset, listingId: listing.id, valuation };
  } catch (error) {
    if (error instanceof AssetChangedError) return { ok: false, reason: 'asset_not_returned' };
    throw error;
  }
}
