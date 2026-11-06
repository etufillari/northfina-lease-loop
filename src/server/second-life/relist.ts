// Puts a returned item back on the market. The dealer records what they found, the value comes
// from the residual curves, and that value becomes the price of the item's next lease.
import { loadCoefficientTable, loadResidualCurves } from '@/data/load';
import type { Asset, AssetCondition } from '@/data/schemas';
import {
  ageInMonths,
  firstLease,
  livesAfterReturn,
  marketValue,
  relistProblem,
  type MarketValue,
  type RelistProblem,
} from '@/domain/second-life/second-life';
import type { PrismaClient } from '@/generated/prisma/client';
import { toAsset } from '../assets/assets';
import { withAudit } from '../audit';
import { currentDate } from '../date/app-date';

export type RelistInput = { assetId: string; condition: AssetCondition; usageValue: number };

export type RelistFailureReason =
  'asset_not_found' | 'asset_not_returned' | 'unknown_first_lease' | RelistProblem;

export type RelistPreview = MarketValue & {
  asset_id: string;
  condition: AssetCondition;
  usage_value: number;
  first_leased_on: string;
  first_lease_price_cents: number;
};

export type PreviewResult =
  | { ok: true; preview: RelistPreview }
  | { ok: false; reason: RelistFailureReason; market_value_cents?: number };

/** The price a returned item would get, for this condition and usage. Changes nothing. */
export async function previewRelist(db: PrismaClient, input: RelistInput): Promise<PreviewResult> {
  const { assetId, condition, usageValue } = input;

  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return { ok: false, reason: 'asset_not_found' };
  const asset = toAsset(row);
  if (asset.status !== 'returned') return { ok: false, reason: 'asset_not_returned' };

  const firstLife = await db.assetLife.findFirst({
    where: { asset_id: assetId, started_on: { not: null } },
    orderBy: { life_number: 'asc' },
    select: { started_on: true, first_lease_price_cents: true },
  });
  const first = firstLease(asset, firstLife);
  if (!first) return { ok: false, reason: 'unknown_first_lease' };

  const [curves, table, today] = await Promise.all([
    loadResidualCurves(),
    loadCoefficientTable(),
    currentDate(db),
  ]);
  const value = marketValue(curves, {
    category: asset.category,
    condition,
    usageValue,
    firstLeasePriceCents: first.priceCents,
    ageMonths: ageInMonths(first.date, today),
  });

  const problem = relistProblem(condition, value.market_value_cents, table);
  if (problem) {
    return { ok: false, reason: problem, market_value_cents: value.market_value_cents };
  }

  return {
    ok: true,
    preview: {
      ...value,
      asset_id: assetId,
      condition,
      usage_value: usageValue,
      first_leased_on: first.date,
      first_lease_price_cents: first.priceCents,
    },
  };
}

export type RelistResult =
  | { ok: true; asset: Asset; preview: RelistPreview }
  | { ok: false; reason: RelistFailureReason; market_value_cents?: number };

class NoLongerReturned extends Error {}

/**
 * Records what the dealer found on the item and on the life that just ended, sets the new
 * price and makes the item available. `previous_lives` catches up with the lives on record.
 */
export async function relistAsset(
  db: PrismaClient,
  input: RelistInput & { actor: string }
): Promise<RelistResult> {
  const { assetId, condition, usageValue, actor } = input;

  const previewed = await previewRelist(db, input);
  if (!previewed.ok) return previewed;
  const { preview } = previewed;

  try {
    const row = await withAudit(
      db,
      {
        actor,
        action: 'asset.relisted',
        entityType: 'asset',
        entityId: assetId,
        details: {
          condition,
          usage_value: usageValue,
          relist_price_cents: preview.market_value_cents,
          age_months: preview.age_months,
        },
      },
      async (tx) => {
        const latest = await tx.assetLife.findFirst({
          where: { asset_id: assetId },
          orderBy: { life_number: 'desc' },
          select: { id: true, life_number: true },
        });
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });

        const changed = await tx.asset.updateMany({
          where: { id: assetId, status: 'returned' },
          data: {
            status: 'available',
            condition,
            usage_value: usageValue,
            relist_price_cents: preview.market_value_cents,
            previous_lives: livesAfterReturn(asset.previous_lives, latest?.life_number),
          },
        });
        if (changed.count === 0) throw new NoLongerReturned();

        if (latest) {
          await tx.assetLife.update({
            where: { id: latest.id },
            data: { end_condition: condition, end_usage_value: usageValue },
          });
        }
        return tx.asset.findUniqueOrThrow({ where: { id: assetId } });
      }
    );
    return { ok: true, asset: toAsset(row), preview };
  } catch (error) {
    if (error instanceof NoLongerReturned) return { ok: false, reason: 'asset_not_returned' };
    throw error;
  }
}

export type ReleaseResult =
  { ok: true; asset: Asset } | { ok: false; reason: 'asset_not_found' | 'asset_not_held' };

class NotHeld extends Error {}

/** Lets anyone lease an item again, when the person it was held for did not take it. */
export async function releaseAsset(
  db: PrismaClient,
  input: { assetId: string; actor: string }
): Promise<ReleaseResult> {
  const { assetId, actor } = input;

  const existing = await db.asset.findUnique({
    where: { id: assetId },
    select: { reserved_for: true },
  });
  if (!existing) return { ok: false, reason: 'asset_not_found' };

  try {
    const row = await withAudit(
      db,
      {
        actor,
        action: 'asset.released',
        entityType: 'asset',
        entityId: assetId,
        details: { held_for: existing.reserved_for },
      },
      async (tx) => {
        const released = await tx.asset.updateMany({
          where: { id: assetId, reserved_for: { not: null } },
          data: { reserved_for: null },
        });
        if (released.count === 0) throw new NotHeld();
        return tx.asset.findUniqueOrThrow({ where: { id: assetId } });
      }
    );
    return { ok: true, asset: toAsset(row) };
  } catch (error) {
    if (error instanceof NotHeld) return { ok: false, reason: 'asset_not_held' };
    throw error;
  }
}
