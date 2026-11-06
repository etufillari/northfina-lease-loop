// Items as they were on the app's date (see src/domain/state-on.ts). An item with no records
// after that date is shown exactly as the database has it now; an item with later records is
// rebuilt from the data pack's description and the records up to that date.
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import type { PrismaClient } from '@/generated/prisma/client';
import { assetStateOn, hasEventsAfter, type AssetEvent } from '@/domain/state-on';
import { toAsset } from './assets';

/**
 * Every dated record of every item (or one item): leases, endings, pass-ons, holds and holds let
 * go, refurbishments.
 */
export async function assetEvents(
  db: PrismaClient,
  assetId?: string
): Promise<Map<string, AssetEvent[]>> {
  const where = assetId ? { asset_id: assetId } : {};
  const [contracts, handovers, refurbishments, holds] = await Promise.all([
    db.contract.findMany({ where }),
    db.handover.findMany({ where: { ...where, status: 'accepted' } }),
    db.refurbishment.findMany({ where }),
    db.holdRequest.findMany({ where: { ...where, held_date: { not: null } } }),
  ]);
  const events = new Map<string, AssetEvent[]>();
  const add = (id: string, event: AssetEvent) => events.set(id, [...(events.get(id) ?? []), event]);
  for (const c of contracts) {
    add(c.asset_id, { date: c.signed_date, kind: 'leased' });
    if (c.bought_date) add(c.asset_id, { date: c.bought_date, kind: 'closed', to: 'sold' });
    else if (c.returned_date)
      add(c.asset_id, { date: c.returned_date, kind: 'closed', to: 'returned' });
  }
  for (const h of handovers) {
    if (h.decided_date) {
      add(h.asset_id, { date: h.decided_date, kind: 'held_for', customerId: h.to_customer_id });
    }
    if (h.released_date) {
      add(h.asset_id, { date: h.released_date, kind: 'released', customerId: h.to_customer_id });
    }
  }
  for (const hold of holds) {
    if (!hold.held_date) continue;
    add(hold.asset_id, { date: hold.held_date, kind: 'held_for', customerId: hold.customer_id });
    if (hold.withdrawn_date) {
      add(hold.asset_id, {
        date: hold.withdrawn_date,
        kind: 'released',
        customerId: hold.customer_id,
      });
    }
  }
  for (const r of refurbishments) {
    add(r.asset_id, {
      date: r.refurbished_date,
      kind: 'refurbished',
      condition: r.condition_after as Asset['condition'],
      usageValue: r.usage_after,
      priceCents: r.price_cents,
    });
  }
  return events;
}

export type AssetOn = {
  asset: Asset;
  reservedFor: string | null;
  secondLifePriceCents: number | null;
  /** The item has records after this date: it can only be looked at, not changed. */
  laterHistory: boolean;
};

type AssetRow = Awaited<ReturnType<PrismaClient['asset']['findMany']>>[number];

function stateOf(
  row: AssetRow,
  dataPack: Map<string, Asset>,
  events: readonly AssetEvent[],
  today: string
): AssetOn {
  const now = toAsset(row);
  if (!hasEventsAfter(events, today)) {
    return {
      asset: now,
      reservedFor: row.reserved_for,
      secondLifePriceCents: row.second_life_price_cents,
      laterHistory: false,
    };
  }
  const start = dataPack.get(row.id) ?? now;
  const state = assetStateOn(
    {
      status: start.status,
      condition: start.condition,
      usageValue: start.usage.value,
      secondLifePriceCents: null,
      reservedFor: null,
    },
    events,
    today
  );
  const livesSince = events.filter((e) => e.kind === 'closed' && e.date <= today).length;
  return {
    asset: {
      ...now,
      status: state.status,
      condition: state.condition,
      usage: { unit: now.usage.unit, value: state.usageValue },
      previous_lives: start.previous_lives + livesSince,
    },
    reservedFor: state.reservedFor,
    secondLifePriceCents: state.secondLifePriceCents,
    laterHistory: true,
  };
}

/** Every item as it was on `today`, in id order. */
export async function assetsOn(db: PrismaClient, today: string): Promise<AssetOn[]> {
  const [rows, events, dataPack] = await Promise.all([
    db.asset.findMany({ orderBy: { id: 'asc' } }),
    assetEvents(db),
    loadAssets(),
  ]);
  const byId = new Map(dataPack.map((asset) => [asset.id, asset]));
  return rows.map((row) => stateOf(row, byId, events.get(row.id) ?? [], today));
}

/** One item as it was on `today`, or `null` if there is no such item. */
export async function assetOn(
  db: PrismaClient,
  id: string,
  today: string
): Promise<AssetOn | null> {
  const row = await db.asset.findUnique({ where: { id } });
  if (!row) return null;
  const [events, dataPack] = await Promise.all([assetEvents(db, id), loadAssets()]);
  const byId = new Map(dataPack.map((asset) => [asset.id, asset]));
  return stateOf(row, byId, events.get(id) ?? [], today);
}

/** Whether the item has records after `today`, which locks it until the app is back there. */
export async function hasLaterHistory(
  db: PrismaClient,
  assetId: string,
  today: string
): Promise<boolean> {
  const [contracts, handovers, refurbishments, holds] = await Promise.all([
    db.contract.count({
      where: {
        asset_id: assetId,
        OR: [
          { signed_date: { gt: today } },
          { returned_date: { gt: today } },
          { bought_date: { gt: today } },
        ],
      },
    }),
    db.handover.count({
      where: {
        asset_id: assetId,
        OR: [
          { passed_date: { gt: today } },
          { decided_date: { gt: today } },
          { released_date: { gt: today } },
        ],
      },
    }),
    db.refurbishment.count({ where: { asset_id: assetId, refurbished_date: { gt: today } } }),
    db.holdRequest.count({
      where: {
        asset_id: assetId,
        OR: [
          { requested_date: { gt: today } },
          { held_date: { gt: today } },
          { withdrawn_date: { gt: today } },
        ],
      },
    }),
  ]);
  return contracts + handovers + refurbishments + holds > 0;
}
