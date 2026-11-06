// Offers and pools for the second-life waiting list.
//
// A pool holds refurbished items for a waiter who wants several (wait-08: three laptops):
// each held item is `reserved` with an active `waitlist_pool` Reservation until the waiter's
// `needed_by`, and its `pooled_for_waiter` passport event names the waiter. When the last
// item arrives the whole set is offered together (7-day `waitlist_offer` holds). A pool that
// never fills is released by staff once the deadline has passed: the items are already
// refurbished, so they go straight to the catalogue (`available`).
import { addDays } from '@/domain/calendar';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit, type TransactionClient } from './audit';

/** Second-life offers hold the item for the waiter this many days (docs/DECISIONS.md). */
export const OFFER_HOLD_DAYS = 7;
export const POOL_RESERVATION = 'waitlist_pool';

type Reader = PrismaClient | TransactionClient;
export type PoolWaiter = {
  id: string;
  who: string;
  quantity: number;
  needed_by: string;
  preferred_term_months: number;
};

function readDetails(json: string | null): Record<string, unknown> {
  if (json === null) return {};
  const value: unknown = JSON.parse(json);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function latestPoolEvent(db: Reader, assetId: string) {
  const event = await db.assetEvent.findFirst({
    where: { asset_id: assetId, type: 'pooled_for_waiter' },
    orderBy: [{ on_date: 'desc' }, { id: 'desc' }],
  });
  return event ? readDetails(event.details_json) : null;
}

/** Items held right now, by waiter id, in asset-id order. */
export async function pooledAssetsByWaiter(db: Reader): Promise<Record<string, string[]>> {
  const holds = await db.reservation.findMany({
    where: { kind: POOL_RESERVATION, active: true },
    orderBy: { asset_id: 'asc' },
  });
  const pools: Record<string, string[]> = {};
  for (const hold of holds) {
    const waiterId = (await latestPoolEvent(db, hold.asset_id))?.waiterId;
    if (typeof waiterId === 'string') (pools[waiterId] ??= []).push(hold.asset_id);
  }
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
    data: { asset_id: assetId, customer_id: null, kind: POOL_RESERVATION, until: waiter.needed_by },
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
 * for a set it is the item that completed it, and the events list every item.
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
      data: { asset_id: item.assetId, customer_id: null, kind: 'waitlist_offer', until },
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
  const rent = (await latestPoolEvent(db, assetId))?.monthlyNetRentCents;
  return typeof rent === 'number' ? rent : null;
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

/** Releases a pool that did not fill before the waiter's deadline: items go to the catalogue. */
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
        await tx.reservation.updateMany({
          where: { asset_id: assetId, active: true },
          data: { active: false },
        });
        await tx.asset.update({ where: { id: assetId }, data: { status: 'available' } });
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
    }
  );
  return { ok: true, releasedAssetIds: assetIds };
}
