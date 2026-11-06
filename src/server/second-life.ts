// Second life (Spine step 7), on the server: the refurbishments that bring a returned item back
// for its next lease. Each one is part of the item's passport.
import { loadPriceLists, loadRefurbishmentCosts, loadSecondLifeDemand } from '@/data/load';
import type { AssetCondition, PriceList } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { applySecondLifePrices } from '@/domain/price-list';
import { repairLines, type CustomRepair } from '@/domain/repair-catalogue';
import { leasableCondition, refurbishmentPlan } from '@/domain/second-life';
import { toAsset } from './assets';
import { withAudit } from './audit';

/** One line of a refurbishment: a required job, a standard repair, or a custom repair. */
export type RefurbishmentLine = {
  kind: 'required' | 'preset' | 'custom';
  /** The job or preset id; null for a custom line. */
  id: string | null;
  /** The name typed in for a custom line. */
  label: string | null;
  /** null for refurbishments saved before costs were kept per line. */
  costCents: number | null;
};

export type Refurbishment = {
  id: number;
  assetId: string;
  date: string;
  conditionBefore: string;
  conditionAfter: string;
  usageBefore: number;
  usageAfter: number;
  lines: RefurbishmentLine[];
  costCents: number;
  priceCents: number;
  notes: string | null;
  actor: string;
};

/** Reads the stored lines; early refurbishments stored just a list of job ids. */
function parseLines(json: string): RefurbishmentLine[] {
  const parsed = JSON.parse(json) as unknown[];
  return parsed.map((line) =>
    typeof line === 'string'
      ? { kind: 'required', id: line, label: null, costCents: null }
      : (line as RefurbishmentLine)
  );
}

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
    lines: parseLines(row.steps_json),
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

export const MAX_USAGE = 10_000_000;

export type RefurbishInput = {
  assetId: string;
  /** What the check found: the condition and usage reading when it came back. */
  conditionFound: AssetCondition;
  usageFound: number;
  conditionAfter: AssetCondition;
  /** Standard repairs done (ids from REPAIR_PRESETS), priced from that list. */
  presetIds: string[];
  /** Any other repairs, each with its own name and net price. */
  customRepairs: CustomRepair[];
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
        | 'invalid_usage'
        | 'cannot_downgrade'
        | 'cannot_reach_new'
        | 'condition_too_low'
        | 'invalid_repairs'
        | 'invalid_price';
    };

/**
 * Refurbishes a returned item for its next life. The check records the condition and usage it
 * came back in (any condition: a "new" item can come back "good"). The required jobs follow from
 * the data (refurbishmentPlan); standard and custom repairs are added on top. The item gets its
 * new condition, usage and second-life price, and goes back as available, or reserved for the
 * customer it was passed on to. The refurbishment, with every line and its cost, and an
 * `asset.refurbished` audit row are written in the same transaction.
 */
export async function refurbishItem(
  db: PrismaClient,
  input: RefurbishInput,
  todayIso: string
): Promise<RefurbishResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'returned') return { ok: false, reason: 'not_returned' };
  if (!Number.isInteger(input.usageFound) || input.usageFound < 0 || input.usageFound > MAX_USAGE) {
    return { ok: false, reason: 'invalid_usage' };
  }
  const asset = toAsset(row);
  const [costs, demand] = await Promise.all([loadRefurbishmentCosts(), loadSecondLifeDemand()]);
  const plan = refurbishmentPlan(
    {
      category: asset.category,
      before: input.conditionFound,
      after: input.conditionAfter,
      usage: input.usageFound,
    },
    costs
  );
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (!leasableCondition(input.conditionAfter, asset.category, demand, todayIso)) {
    return { ok: false, reason: 'condition_too_low' };
  }
  const repairs = repairLines(asset.category, input.presetIds, input.customRepairs);
  if (!repairs.ok) return { ok: false, reason: 'invalid_repairs' };
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    return { ok: false, reason: 'invalid_price' };
  }

  const lines: RefurbishmentLine[] = [
    ...plan.steps.map((step) => ({
      kind: 'required' as const,
      id: step.id,
      label: null,
      costCents: step.costCents,
    })),
    ...repairs.lines.map((line) => ({
      kind: line.presetId ? ('preset' as const) : ('custom' as const),
      id: line.presetId,
      label: line.label,
      costCents: line.costCents,
    })),
  ];
  const costCents = plan.costCents + repairs.costCents;
  const status = row.reserved_for ? 'reserved' : 'available';

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.refurbished',
      entityType: 'asset',
      entityId: asset.id,
      details: {
        found: { condition: input.conditionFound, usage: input.usageFound },
        to: input.conditionAfter,
        lines,
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
          condition_before: input.conditionFound,
          condition_after: input.conditionAfter,
          usage_before: input.usageFound,
          usage_after: plan.usageAfter,
          steps_json: JSON.stringify(lines),
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
