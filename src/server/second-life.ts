// The second-life desk (scenario card 9): every returned asset gets the frozen domain call
// `secondLifeDecision` with the price-list v1 price as its original price, the as-of date and
// the live waiting list. Executing a decision writes it in one audited transaction: the
// refurbishment (and upgrade) on the passport, the asset's new condition and usage, one more
// life, and — when someone on the waiting list won — a 7-day offer hold for them.
import {
  loadCo2Factors,
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
} from '@/data/load';
import { secondLifeRequestSchema, type Asset, type SecondLifeRequest } from '@/data/schemas';
import { addDays } from '@/domain/calendar';
import { co2AvoidedKg } from '@/domain/co2';
import { listPriceOn } from '@/domain/price-list';
import { quoteFor, type Quote } from '@/domain/pricing';
import { secondLifeDecision, type SecondLifeDecision } from '@/domain/second-life';
import type { PrismaClient, WaitlistEntry } from '@/generated/prisma/client';
import { toAsset } from './assets';
import { withAudit } from './audit';
import { listWaitlist } from './waitlist';

type Db = PrismaClient;

/** The "original price" of every residual calculation: the asset's price in price list v1. */
export const ORIGINAL_PRICE_DATE = '2026-01-01';

/** Second-life offers hold the item for the waiter this many days (docs/DECISIONS.md). */
export const OFFER_HOLD_DAYS = 7;

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

async function loadInputs(db: Db) {
  const [curves, costs, table, priceLists, rows] = await Promise.all([
    loadResidualCurves(),
    loadRefurbishmentCosts(),
    loadCoefficientTable(),
    loadPriceLists(),
    listWaitlist(db),
  ]);
  // Only people still waiting compete: someone already offered an item is not matched twice.
  const demand = rows.filter((row) => row.status === 'waiting').map(toSecondLifeRequest);
  return { curves, costs, table, priceLists, demand };
}

export type SecondLifePreview = {
  asset: Asset;
  asOf: string;
  originalListPriceCents: number;
  decision: SecondLifeDecision;
  /** Everyone the decision looked at, by id, so the desk can say who they are. */
  waiters: Record<string, SecondLifeRequest>;
  winner: SecondLifeRequest | null;
  /** The winner's lease at their preferred term, with no down payment. */
  winnerQuote: Quote | null;
};

export type SecondLifeFailure = 'not_found' | 'not_returned' | 'no_v1_price';
export type SecondLifePreviewResult =
  { ok: true; preview: SecondLifePreview } | { ok: false; reason: SecondLifeFailure };

function decide(
  asset: Asset,
  asOf: string,
  inputs: Awaited<ReturnType<typeof loadInputs>>
): SecondLifePreviewResult {
  if (asset.status !== 'returned') return { ok: false, reason: 'not_returned' };
  const v1 = listPriceOn(inputs.priceLists, asset.id, ORIGINAL_PRICE_DATE);
  if (!v1.ok) return { ok: false, reason: 'no_v1_price' };

  const decision = secondLifeDecision(
    { asset, originalListPriceCents: v1.priceCents, asOfDate: asOf },
    {
      curves: inputs.curves,
      costs: inputs.costs,
      demand: inputs.demand,
      table: inputs.table,
    }
  );
  const byId = new Map(inputs.demand.map((w) => [w.id, w]));
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
        table: inputs.table,
      })
    : null;

  return {
    ok: true,
    preview: {
      asset,
      asOf,
      originalListPriceCents: v1.priceCents,
      decision,
      waiters,
      winner,
      winnerQuote: quoted?.ok ? quoted.quote : null,
    },
  };
}

/** The decision for one returned asset, without changing anything. */
export async function previewSecondLife(
  db: Db,
  assetId: string,
  asOf: string
): Promise<SecondLifePreviewResult> {
  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) return { ok: false, reason: 'not_found' };
  return decide(toAsset(row), asOf, await loadInputs(db));
}

/** The desk: a decision for every asset waiting in `returned`, oldest id first. */
export async function listReturnedDecisions(
  db: Db,
  asOf: string
): Promise<Array<{ assetId: string; result: SecondLifePreviewResult }>> {
  const rows = await db.asset.findMany({ where: { status: 'returned' }, orderBy: { id: 'asc' } });
  const inputs = await loadInputs(db);
  return rows.map((row) => ({ assetId: row.id, result: decide(toAsset(row), asOf, inputs) }));
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

export type ExecuteSecondLifeResult =
  | { ok: true; preview: SecondLifePreview; co2AvoidedKg: number | null }
  | { ok: false; reason: SecondLifeFailure };

/**
 * Carries out the decision. It is recomputed here, so the browser never tells the server
 * what to do. Asset status afterwards: `reserved` (with a waitlist_offer Reservation) when a
 * waiter won, `available` when it is listed publicly, `sold` when it goes to the parts bin.
 */
export async function executeSecondLife(
  db: Db,
  input: { assetId: string; actor: string; asOf: string }
): Promise<ExecuteSecondLifeResult> {
  const previewed = await previewSecondLife(db, input.assetId, input.asOf);
  if (!previewed.ok) return previewed;
  const { preview } = previewed;
  const { asset, decision, asOf } = preview;
  const previousLives = asset.previous_lives + ((await endedLifeUncounted(db, asset.id)) ? 1 : 0);

  const co2 =
    decision.action === 'parts_bin'
      ? null
      : lifeCo2Kg(
          {
            category: asset.category,
            valueCents: decision.valueFinalCents,
            originalListPriceCents: preview.originalListPriceCents,
          },
          await loadCo2Factors()
        );

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'asset.second_life_executed',
      entityType: 'asset',
      entityId: asset.id,
      details: {
        action: decision.action,
        refurbishment: decision.requiredItems.map((i) => i.id),
        refurbishmentCents: decision.requiredTotalCents,
        upgrade: decision.upgrade,
        financedCents: decision.financedCents,
        winnerId: decision.winnerId,
        monthlyNetRentCents: preview.winnerQuote?.monthlyNetRentCents ?? null,
      },
    },
    async (tx) => {
      const event = (type: string, details: unknown) =>
        tx.assetEvent.create({
          data: { asset_id: asset.id, type, on_date: asOf, details_json: JSON.stringify(details) },
        });

      if (decision.action === 'parts_bin') {
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

      const winner = preview.winner;
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          condition: decision.upgrade?.to ?? asset.condition,
          usage_value: decision.usageAfterRefurb,
          previous_lives: previousLives,
          status: winner ? 'reserved' : 'available',
        },
      });
      if (!winner) return;

      await tx.waitlistEntry.update({
        where: { id: winner.id },
        data: { status: 'offered', offered_asset_id: asset.id },
      });
      const until = addDays(asOf, OFFER_HOLD_DAYS);
      await tx.reservation.create({
        data: { asset_id: asset.id, customer_id: null, kind: 'waitlist_offer', until },
      });
      await event('offered_to_waiter', {
        waiterId: winner.id,
        who: winner.who,
        termMonths: winner.preferred_term_months,
        monthlyNetRentCents: preview.winnerQuote?.monthlyNetRentCents ?? null,
        until,
      });
    }
  );
  return { ok: true, preview, co2AvoidedKg: co2?.kg ?? null };
}
