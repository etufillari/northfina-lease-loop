// The second-life desk (scenario card 9). Every returned asset gets the frozen domain call
// `secondLifeDecision` (v1 price as the original price, the as-of date, the live waiting
// list), shared out across the whole desk by `allocateDesk`: one person never wins two
// cards, and a multi-item waiter's items are pooled until the set is complete. Executing a
// decision writes it in one audited transaction: the refurbishment (and upgrade) on the
// passport, the asset's new condition and usage, the life count, and the offer or pool hold.
import {
  loadCo2Factors,
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
} from '@/data/load';
import { secondLifeRequestSchema, type Asset, type SecondLifeRequest } from '@/data/schemas';
import { co2AvoidedKg } from '@/domain/co2';
import { listPriceOn } from '@/domain/price-list';
import { quoteFor, type Quote } from '@/domain/pricing';
import type { SecondLifeDecision } from '@/domain/second-life';
import {
  allocateDesk,
  type DeskAllocation,
  type DeskItem,
  type DeskOutcome,
} from '@/domain/second-life-allocation';
import type { PrismaClient, WaitlistEntry } from '@/generated/prisma/client';
import { toAsset } from './assets';
import { withAudit } from './audit';
import { holdForPool, offerSet, pooledAssetsByWaiter, pooledRent } from './second-life-pools';
import { listWaitlist } from './waitlist';

type Db = PrismaClient;

/** The "original price" of every residual calculation: the asset's price in price list v1. */
export const ORIGINAL_PRICE_DATE = '2026-01-01';

/** A waiting-list row back in the data-pack shape the domain expects. */
export function toSecondLifeRequest(row: WaitlistEntry): SecondLifeRequest {
  return secondLifeRequestSchema.parse({
    id: row.id,
    category: row.category,
    max_monthly_net_rent_cents: row.max_monthly_net_rent_cents,
    min_condition: row.min_condition,
    preferred_term_months: row.preferred_term_months,
    needed_by: row.needed_by,
    joined_on: row.joined_on,
    quantity: row.quantity,
    who: row.who,
  });
}

/** kg CO2e avoided by the life that starts now, rounded to 0.1 kg for display and storage. */
export function lifeCo2Kg(
  input: { category: Asset['category']; valueCents: number; originalListPriceCents: number },
  factors: Awaited<ReturnType<typeof loadCo2Factors>>
): { kg: number; remainingValueFraction: number } {
  const remainingValueFraction =
    input.originalListPriceCents > 0 ? input.valueCents / input.originalListPriceCents : 0;
  const kg = co2AvoidedKg({ category: input.category, remainingValueFraction }, factors);
  return { kg: Math.round(kg * 10) / 10, remainingValueFraction };
}

export type SecondLifePreview = {
  asset: Asset;
  asOf: string;
  originalListPriceCents: number;
  decision: SecondLifeDecision;
  /** What the desk does with it: offer, pool, complete a pool, list or scrap. */
  outcome: DeskOutcome;
  /** Everyone the decision looked at, by id, so the desk can say who they are. */
  waiters: Record<string, SecondLifeRequest>;
  winner: SecondLifeRequest | null;
  /** The winner's lease for this item at their preferred term, with no down payment. */
  winnerQuote: Quote | null;
  /** Items already held for the winner from earlier desk runs (pools only). */
  pooledAssetIds: string[];
};

export type SecondLifeFailure = 'not_found' | 'not_returned' | 'no_v1_price';
export type SecondLifePreviewResult =
  { ok: true; preview: SecondLifePreview } | { ok: false; reason: SecondLifeFailure };

/** The desk: every asset waiting in `returned`, shared out in asset-id order. */
export async function listReturnedDecisions(
  db: Db,
  asOf: string
): Promise<Array<{ assetId: string; result: SecondLifePreviewResult }>> {
  const [curves, costs, table, priceLists, rows, assetRows, pools] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadPriceLists(),
    listWaitlist(db),
    db.asset.findMany({ where: { status: 'returned' }, orderBy: { id: 'asc' } }),
    pooledAssetsByWaiter(db),
  ]);
  // Only people still waiting compete: someone already offered an item is not matched twice.
  const demand = rows.filter((row) => row.status === 'waiting').map(toSecondLifeRequest);
  const byId = new Map(demand.map((w) => [w.id, w]));

  const items: DeskItem[] = [];
  for (const row of assetRows) {
    const v1 = listPriceOn(priceLists, row.id, ORIGINAL_PRICE_DATE);
    if (v1.ok) items.push({ asset: toAsset(row), originalListPriceCents: v1.priceCents });
  }
  const pooled = Object.fromEntries(Object.entries(pools).map(([id, ids]) => [id, ids.length]));
  const allocations = new Map(
    allocateDesk(items, { asOfDate: asOf, demand, pooled }, { curves, costs, table }).map((a) => [
      a.assetId,
      a,
    ])
  );

  const toPreview = (item: DeskItem, allocation: DeskAllocation): SecondLifePreview => {
    const { decision } = allocation;
    const waiters: Record<string, SecondLifeRequest> = {};
    for (const verdict of decision.considered) {
      const waiter = byId.get(verdict.id);
      if (waiter) waiters[verdict.id] = waiter;
    }
    const winner = decision.winnerId ? (byId.get(decision.winnerId) ?? null) : null;
    const quoted = winner
      ? quoteFor({
          listPriceCents: decision.financedCents,
          downPaymentCents: 0,
          termMonths: winner.preferred_term_months,
          table,
        })
      : null;
    return {
      ...item,
      asOf,
      decision,
      outcome: allocation.outcome,
      waiters,
      winner,
      winnerQuote: quoted?.ok ? quoted.quote : null,
      pooledAssetIds: winner ? (pools[winner.id] ?? []) : [],
    };
  };

  return assetRows.map((row) => {
    const item = items.find((i) => i.asset.id === row.id);
    const allocation = allocations.get(row.id);
    return {
      assetId: row.id,
      result:
        item && allocation
          ? { ok: true, preview: toPreview(item, allocation) }
          : { ok: false, reason: 'no_v1_price' },
    };
  });
}

/** The desk's decision for one asset, exactly as its card shows it. Changes nothing. */
export async function previewSecondLife(
  db: Db,
  assetId: string,
  asOf: string
): Promise<SecondLifePreviewResult> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'returned') return { ok: false, reason: 'not_returned' };
  const desk = await listReturnedDecisions(db, asOf);
  return desk.find((entry) => entry.assetId === assetId)!.result;
}

/**
 * `previous_lives` counts completed lives. The data pack's returned items already count the
 * life they came back from (ebike-008 "already had 2 lives" has previous_lives 2, and its next
 * lease is its third life), but a return made in the app only writes a `returned` event. So
 * the desk counts the ended life exactly when a `returned` event came after the last
 * refurbishment — never twice.
 */
async function endedLifeUncounted(db: Db, assetId: string): Promise<boolean> {
  const last = await db.assetEvent.findFirst({
    where: { asset_id: assetId, type: { in: ['returned', 'refurbished'] } },
    orderBy: [{ on_date: 'desc' }, { id: 'desc' }],
  });
  return last?.type === 'returned';
}

/** What the execute actually did (a pool completes only when its items are really held). */
export type AppliedOutcome = 'offer' | 'pool' | 'complete_pool' | 'list_available' | 'parts_bin';

export type ExecuteSecondLifeResult =
  | { ok: true; preview: SecondLifePreview; applied: AppliedOutcome; co2AvoidedKg: number | null }
  | { ok: false; reason: SecondLifeFailure };

/**
 * Carries out the card's decision. It is recomputed here, so the browser never tells the
 * server what to do. Status afterwards: `reserved` (offer or pool hold) when a waiter won,
 * `available` when listed publicly, `sold` when it goes to the parts bin. A pool completes on
 * the items really held in the database, so executing a desk's cards in any order ends in
 * the same state.
 */
export async function executeSecondLife(
  db: Db,
  input: { assetId: string; actor: string; asOf: string }
): Promise<ExecuteSecondLifeResult> {
  const previewed = await previewSecondLife(db, input.assetId, input.asOf);
  if (!previewed.ok) return previewed;
  const { preview } = previewed;
  const { asset, decision, outcome, winner, asOf } = preview;
  const rent = preview.winnerQuote?.monthlyNetRentCents ?? null;
  const previousLives = asset.previous_lives + ((await endedLifeUncounted(db, asset.id)) ? 1 : 0);

  const co2 =
    outcome.kind === 'parts_bin'
      ? null
      : lifeCo2Kg(
          {
            category: asset.category,
            valueCents: decision.valueFinalCents,
            originalListPriceCents: preview.originalListPriceCents,
          },
          await loadCo2Factors()
        );

  // A pool completes on the items really held now, not on the card's projection.
  const poolFor =
    outcome.kind === 'pool' || outcome.kind === 'complete_pool' ? (winner ?? null) : null;
  const held = poolFor ? ((await pooledAssetsByWaiter(db))[poolFor.id] ?? []) : [];
  let applied: AppliedOutcome;
  if (poolFor) applied = held.length + 1 >= poolFor.quantity ? 'complete_pool' : 'pool';
  else if (outcome.kind === 'pool' || outcome.kind === 'complete_pool') applied = 'list_available';
  else applied = outcome.kind;

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.second_life_executed',
      entityType: 'asset',
      entityId: asset.id,
      details: {
        outcome: applied,
        refurbishment: decision.requiredItems.map((i) => i.id),
        refurbishmentCents: decision.requiredTotalCents,
        upgrade: decision.upgrade,
        financedCents: decision.financedCents,
        winnerId: decision.winnerId,
        monthlyNetRentCents: rent,
      },
    },
    async (tx) => {
      const event = (type: string, details: unknown) =>
        tx.assetEvent.create({
          data: { asset_id: asset.id, type, on_date: asOf, details_json: JSON.stringify(details) },
        });

      if (applied === 'parts_bin') {
        await event('parts_bin', {
          valueAsIsCents: decision.valueAsIsCents,
          financedCents: decision.financedCents,
        });
        await tx.asset.update({ where: { id: asset.id }, data: { status: 'sold' } });
        return;
      }

      await event('refurbished', {
        items: decision.requiredItems,
        totalCents: decision.requiredTotalCents,
        usageReset: decision.usageAfterRefurb !== asset.usage.value,
        usageBefore: asset.usage.value,
        valueCents: decision.valueFinalCents,
        financedCents: decision.financedCents,
        life: previousLives + 1,
        co2AvoidedKg: co2?.kg ?? null,
      });
      if (decision.upgrade) await event('upgraded', decision.upgrade);
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          condition: decision.upgrade?.to ?? asset.condition,
          usage_value: decision.usageAfterRefurb,
          previous_lives: previousLives,
          status: 'available',
        },
      });
      if (applied === 'list_available' || !winner) return;

      if (applied === 'pool') {
        await holdForPool(tx, {
          assetId: asset.id,
          waiter: winner,
          filled: held.length + 1,
          monthlyNetRentCents: rent,
          asOf,
        });
        return;
      }
      // A plain offer (nothing held) is a set of one; a completed pool offers every item.
      const items = [];
      for (const assetId of held) {
        items.push({ assetId, monthlyNetRentCents: await pooledRent(tx, assetId) });
      }
      items.push({ assetId: asset.id, monthlyNetRentCents: rent });
      await offerSet(tx, { waiter: winner, items, asOf });
    }
  );
  return { ok: true, preview, applied, co2AvoidedKg: co2?.kg ?? null };
}
