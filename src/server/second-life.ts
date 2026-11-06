// Second life (Spine step 7), on the server: the refurbishments that bring a returned item back
// for its next lease. Each one is part of the item's passport.
import { loadPriceLists, loadRefurbishmentCosts, loadSecondLifeDemand } from '@/data/load';
import type { AssetCondition, PriceList } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { applySecondLifePrices } from '@/domain/price-list';
import { leasableCondition, refurbishmentPlan } from '@/domain/second-life';
import { toAsset } from './assets';
import { withAudit } from './audit';

export type Refurbishment = {
  id: number;
  assetId: string;
  date: string;
  conditionBefore: string;
  conditionAfter: string;
  usageBefore: number;
  usageAfter: number;
  steps: string[];
  costCents: number;
  priceCents: number;
  notes: string | null;
  actor: string;
};

/** The refurbishments of one item, oldest first. */
export async function listRefurbishments(
  db: PrismaClient,
  assetId: string
): Promise<Refurbishment[]> {
  const rows = await db.refurbishment.findMany({
    where: { asset_id: assetId },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    date: row.refurbished_date,
    conditionBefore: row.condition_before,
    conditionAfter: row.condition_after,
    usageBefore: row.usage_before,
    usageAfter: row.usage_after,
    steps: JSON.parse(row.steps_json) as string[],
    costCents: row.cost_cents,
    priceCents: row.price_cents,
    notes: row.notes,
    actor: row.actor,
  }));
}

/** Refurbished items' second-life prices, by asset id. */
export async function secondLifePrices(db: PrismaClient): Promise<Record<string, number>> {
  const rows = await db.asset.findMany({
    where: { second_life_price_cents: { not: null } },
    select: { id: true, second_life_price_cents: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.second_life_price_cents as number]));
}

/** The price lists with second-life prices in place, as every page and quote should see them. */
export async function effectivePriceLists(db: PrismaClient): Promise<PriceList[]> {
  const [lists, prices] = await Promise.all([loadPriceLists(), secondLifePrices(db)]);
  return applySecondLifePrices(lists, prices);
}

/** The item's net list price at its first lease: the earliest price list's price. */
export async function originalListPrice(assetId: string): Promise<number | null> {
  const lists = [...(await loadPriceLists())].sort((a, b) =>
    a.valid_from.localeCompare(b.valid_from)
  );
  return lists[0]?.prices[assetId] ?? null;
}

export type RefurbishInput = {
  assetId: string;
  conditionAfter: AssetCondition;
  /** Optional extra repairs, net cents, on top of the planned jobs. */
  extraCostCents: number;
  priceCents: number;
  notes: string | null;
  actor: string;
};

export type RefurbishResult =
  | { ok: true; status: 'available' | 'reserved'; costCents: number }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_returned'
        | 'cannot_downgrade'
        | 'cannot_reach_new'
        | 'condition_too_low'
        | 'invalid_price';
    };

/**
 * Refurbishes a returned item for its next life. The planned jobs follow from the data
 * (refurbishmentPlan); the item gets its new condition, usage and second-life price, and goes
 * back as available, or as reserved for the customer it was passed on to. The refurbishment
 * and an `asset.refurbished` audit row are written in the same transaction.
 */
export async function refurbishItem(
  db: PrismaClient,
  input: RefurbishInput,
  todayIso: string
): Promise<RefurbishResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'returned') return { ok: false, reason: 'not_returned' };
  const asset = toAsset(row);
  const [costs, demand] = await Promise.all([loadRefurbishmentCosts(), loadSecondLifeDemand()]);
  const plan = refurbishmentPlan(
    {
      category: asset.category,
      before: asset.condition,
      after: input.conditionAfter,
      usage: asset.usage.value,
    },
    costs
  );
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (!leasableCondition(input.conditionAfter, asset.category, demand, todayIso)) {
    return { ok: false, reason: 'condition_too_low' };
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    return { ok: false, reason: 'invalid_price' };
  }
  const costCents = plan.costCents + input.extraCostCents;
  const status = row.reserved_for ? 'reserved' : 'available';

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.refurbished',
      entityType: 'asset',
      entityId: asset.id,
      details: {
        from: asset.condition,
        to: input.conditionAfter,
        steps: plan.steps.map((step) => step.id),
        costCents,
        priceCents: input.priceCents,
        status,
      },
    },
    async (tx) => {
      await tx.refurbishment.create({
        data: {
          asset_id: asset.id,
          refurbished_date: todayIso,
          condition_before: asset.condition,
          condition_after: input.conditionAfter,
          usage_before: asset.usage.value,
          usage_after: plan.usageAfter,
          steps_json: JSON.stringify(plan.steps.map((step) => step.id)),
          cost_cents: costCents,
          price_cents: input.priceCents,
          notes: input.notes,
          actor: input.actor,
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          condition: input.conditionAfter,
          usage_value: plan.usageAfter,
          second_life_price_cents: input.priceCents,
          status,
        },
      });
    }
  );
  return { ok: true, status, costCents };
}
