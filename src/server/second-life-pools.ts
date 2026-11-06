// Holds on refurbished items for people on the waiting list, and passing items on.
//
// - An offer holds an item (or a whole set) for one waiter for 7 days: an active
//   `waitlist_offer` Reservation that names the entry (and the customer, when there is one).
// - A pool holds items for a waiter who wants several (wait-08: three laptops) until their
//   `needed_by`: active `waitlist_pool` Reservations. When the last item arrives the whole
//   set is offered together.
// - When an offer ends without a lease (declined, expired) or a pool is released, the items
//   are passed on: the next person in line, at the second-life price the desk already set,
//   with the same pooling rules — or the catalogue when nobody fits.
import { loadCoefficientTable } from '@/data/load';
import type { AssetCategory, AssetCondition } from '@/data/schemas';
import { addDays } from '@/domain/calendar';
import { quoteFor } from '@/domain/pricing';
import { allocateRefurbished, type HandoverAllocation } from '@/domain/second-life-allocation';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit, type TransactionClient } from './audit';
import { toSecondLifeRequest } from './waitlist';

/** Second-life offers hold the item for the waiter this many days (docs/DECISIONS.md). */
export const OFFER_HOLD_DAYS = 7;
export const POOL_RESERVATION = 'waitlist_pool';
export const OFFER_RESERVATION = 'waitlist_offer';

type Reader = PrismaClient | TransactionClient;
export type PoolWaiter = {
  id: string;
  who: string;
  quantity: number;
  needed_by: string;
  preferred_term_months: number;
  customer_id: string | null;
};

/** Items held right now in pools, by waiter id, in asset-id order. */
export async function pooledAssetsByWaiter(db: Reader): Promise<Record<string, string[]>> {
  const holds = await db.reservation.findMany({
    where: { kind: POOL_RESERVATION, active: true, waitlist_entry_id: { not: null } },
    orderBy: { asset_id: 'asc' },
  });
  const pools: Record<string, string[]> = {};
  for (const hold of holds) (pools[hold.waitlist_entry_id!] ??= []).push(hold.asset_id);
  return pools;
}

/** Holds one refurbished item for a multi-item waiter. */
export async function holdForPool(
  tx: TransactionClient,
  input: {
    assetId: string;
    waiter: PoolWaiter;
    filled: number;
    monthlyNetRentCents: number | null;
    asOf: string;
  }
) {
  const { assetId, waiter } = input;
  await tx.reservation.create({
    data: {
      asset_id: assetId,
      customer_id: waiter.customer_id,
      kind: POOL_RESERVATION,
      until: waiter.needed_by,
      waitlist_entry_id: waiter.id,
    },
  });
  await tx.asset.update({ where: { id: assetId }, data: { status: 'reserved' } });
  await tx.assetEvent.create({
    data: {
      asset_id: assetId,
      type: 'pooled_for_waiter',
      on_date: input.asOf,
      details_json: JSON.stringify({
        waiterId: waiter.id,
        who: waiter.who,
        filled: input.filled,
        quantity: waiter.quantity,
        monthlyNetRentCents: input.monthlyNetRentCents,
        until: waiter.needed_by,
      }),
    },
  });
}

/**
 * Offers a set of items (one, or a full pool) to a waiter: each gets a 7-day offer hold and an
 * `offered_to_waiter` event, and the waiting-list entry becomes `offered`. Items that were
 * pooled carry the rent worked out when they were pooled. `offered_asset_id` holds one id;
 * for a set it is the item that completed it, and the holds list every item.
 */
export async function offerSet(
  tx: TransactionClient,
  input: {
    waiter: PoolWaiter;
    items: Array<{ assetId: string; monthlyNetRentCents: number | null }>;
    asOf: string;
  }
) {
  const until = addDays(input.asOf, OFFER_HOLD_DAYS);
  for (const item of input.items) {
    await tx.reservation.updateMany({
      where: { asset_id: item.assetId, active: true },
      data: { active: false },
    });
    await tx.reservation.create({
      data: {
        asset_id: item.assetId,
        customer_id: input.waiter.customer_id,
        kind: OFFER_RESERVATION,
        until,
        waitlist_entry_id: input.waiter.id,
      },
    });
    await tx.asset.update({ where: { id: item.assetId }, data: { status: 'reserved' } });
    await tx.assetEvent.create({
      data: {
        asset_id: item.assetId,
        type: 'offered_to_waiter',
        on_date: input.asOf,
        details_json: JSON.stringify({
          waiterId: input.waiter.id,
          who: input.waiter.who,
          termMonths: input.waiter.preferred_term_months,
          monthlyNetRentCents: item.monthlyNetRentCents,
          setSize: input.items.length,
          until,
        }),
      },
    });
  }
  await tx.waitlistEntry.update({
    where: { id: input.waiter.id },
    data: { status: 'offered', offered_asset_id: input.items.at(-1)?.assetId ?? null },
  });
}

/** The rent recorded when an item was pooled, so a completed set is offered as it was priced. */
export async function pooledRent(db: Reader, assetId: string): Promise<number | null> {
  const event = await db.assetEvent.findFirst({
    where: { asset_id: assetId, type: 'pooled_for_waiter' },
    orderBy: [{ on_date: 'desc' }, { id: 'desc' }],
  });
  const details: unknown = event?.details_json ? JSON.parse(event.details_json) : null;
  const rent =
    details !== null && typeof details === 'object'
      ? (details as { monthlyNetRentCents?: unknown }).monthlyNetRentCents
      : null;
  return typeof rent === 'number' ? rent : null;
}

/**
 * Passes refurbished items on (inside the caller's audited transaction): their holds end,
 * then each goes to the next person in line at its second-life price — an offer, a pool hold
 * or a completed set — or to the catalogue when nobody fits. `reason` is stamped on the
 * passport. An item without a second-life price (refurbished before prices were stored) is
 * listed in the catalogue.
 */
export async function passItemsOn(
  tx: TransactionClient,
  input: { assetIds: string[]; asOf: string; reason: string }
): Promise<Array<{ assetId: string; outcome: HandoverAllocation['outcome'] }>> {
  for (const assetId of input.assetIds) {
    await tx.reservation.updateMany({
      where: { asset_id: assetId, active: true },
      data: { active: false },
    });
  }
  const [table, assets, rows, pools] = await Promise.all([
    loadCoefficientTable(),
    tx.asset.findMany({ where: { id: { in: input.assetIds } } }),
    tx.waitlistEntry.findMany({ where: { status: 'waiting' } }),
    pooledAssetsByWaiter(tx),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const priced = assets.filter((a) => a.second_life_price_cents !== null);
  const allocation = allocateRefurbished(
    priced.map((a) => ({
      assetId: a.id,
      category: a.category as AssetCategory,
      condition: a.condition as AssetCondition,
      financedCents: a.second_life_price_cents!,
    })),
    {
      asOfDate: input.asOf,
      demand: rows.map(toSecondLifeRequest),
      pooled: Object.fromEntries(Object.entries(pools).map(([id, ids]) => [id, ids.length])),
    },
    table
  );
  const unpriced = assets
    .filter((a) => a.second_life_price_cents === null)
    .map((a) => ({ assetId: a.id, outcome: { kind: 'list_available' as const } }));

  const results: Array<{ assetId: string; outcome: HandoverAllocation['outcome'] }> = [];
  for (const { assetId, outcome } of [...allocation, ...unpriced]) {
    results.push({ assetId, outcome });
    const asset = assets.find((a) => a.id === assetId)!;
    if (outcome.kind === 'list_available') {
      await tx.asset.update({ where: { id: assetId }, data: { status: 'available' } });
      await tx.assetEvent.create({
        data: {
          asset_id: assetId,
          type: 'listed_available',
          on_date: input.asOf,
          details_json: JSON.stringify({ reason: input.reason }),
        },
      });
      continue;
    }
    const waiter = byId.get(outcome.waiterId)!;
    const quoted = quoteFor({
      listPriceCents: asset.second_life_price_cents!,
      downPaymentCents: 0,
      termMonths: waiter.preferred_term_months,
      table,
    });
    const rent = quoted.ok ? quoted.quote.monthlyNetRentCents : null;
    if (outcome.kind === 'pool') {
      const held = (await pooledAssetsByWaiter(tx))[waiter.id] ?? [];
      await holdForPool(tx, {
        assetId,
        waiter,
        filled: held.length + 1,
        monthlyNetRentCents: rent,
        asOf: input.asOf,
      });
      continue;
    }
    const held =
      outcome.kind === 'complete_pool' ? ((await pooledAssetsByWaiter(tx))[waiter.id] ?? []) : [];
    const items = [];
    for (const heldId of held) {
      items.push({ assetId: heldId, monthlyNetRentCents: await pooledRent(tx, heldId) });
    }
    items.push({ assetId, monthlyNetRentCents: rent });
    await offerSet(tx, { waiter, items, asOf: input.asOf });
  }
  return results;
}

export type PoolSummary = {
  waiter: PoolWaiter;
  assetIds: string[];
  /** The waiter's deadline has passed and the pool can be released. */
  expired: boolean;
};

/** Every open pool, for the desk. */
export async function listPools(db: PrismaClient, asOf: string): Promise<PoolSummary[]> {
  const pools = await pooledAssetsByWaiter(db);
  const waiters = await db.waitlistEntry.findMany({
    where: { id: { in: Object.keys(pools) } },
    orderBy: [{ joined_on: 'asc' }, { id: 'asc' }],
  });
  return waiters.map((waiter) => ({
    waiter,
    assetIds: pools[waiter.id] ?? [],
    expired: waiter.needed_by < asOf,
  }));
}

export type ReleasePoolResult =
  | { ok: true; releasedAssetIds: string[] }
  | { ok: false; reason: 'not_found' | 'no_pool' | 'not_expired' };

/**
 * Releases a pool that did not fill before the waiter's deadline. The items are already
 * refurbished and priced, so they are passed on to the next person in line (or listed).
 */
export async function releasePool(
  db: PrismaClient,
  input: { waiterId: string; actor: string; asOf: string }
): Promise<ReleasePoolResult> {
  const waiter = await db.waitlistEntry.findUnique({ where: { id: input.waiterId } });
  if (!waiter) return { ok: false, reason: 'not_found' };
  const assetIds = (await pooledAssetsByWaiter(db))[waiter.id] ?? [];
  if (assetIds.length === 0) return { ok: false, reason: 'no_pool' };
  if (input.asOf <= waiter.needed_by) return { ok: false, reason: 'not_expired' };

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'waitlist.pool_released',
      entityType: 'waitlist_entry',
      entityId: waiter.id,
      details: { assetIds, filled: assetIds.length, quantity: waiter.quantity },
    },
    async (tx) => {
      for (const assetId of assetIds) {
        await tx.assetEvent.create({
          data: {
            asset_id: assetId,
            type: 'pool_released',
            on_date: input.asOf,
            details_json: JSON.stringify({
              waiterId: waiter.id,
              filled: assetIds.length,
              quantity: waiter.quantity,
              reason: 'deadline_passed',
            }),
          },
        });
      }
      await passItemsOn(tx, { assetIds, asOf: input.asOf, reason: 'pool_released' });
    }
  );
  return { ok: true, releasedAssetIds: assetIds };
}
