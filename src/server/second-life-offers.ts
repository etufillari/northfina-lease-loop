// Offers of refurbished items to people on the waiting list, and passing items on.
//
// - An offer holds an item (or a whole set) for one waiter for 3 days: an active
//   `waitlist_offer` Reservation that names the entry (and the customer, when there is one).
// - Nothing is ever held back for a set that is not complete. A waiter who wants several gets
//   an offer only when the whole set is free at once (src/domain/second-life-allocation.ts):
//   the item at hand plus refurbished items on the shelf, i.e. listed and not held.
// - When an offer ends without a lease (declined, expired) the items are passed on: the next
//   person in line, at the second-life price the desk already set, with the same set rule —
//   or the catalogue when nobody fits.
import { loadCoefficientTable } from '@/data/load';
import type { AssetCategory, AssetCondition, CoefficientTable } from '@/data/schemas';
import { addDays } from '@/domain/calendar';
import { HOLD_DAYS } from '@/domain/holds';
import { quoteFor } from '@/domain/pricing';
import {
  allocateRefurbished,
  type HandoverAllocation,
  type RefurbishedItem,
} from '@/domain/second-life-allocation';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';
import { toSecondLifeRequest } from './waitlist';

/** Second-life offers hold the item for the waiter this many days (docs/DECISIONS.md). */
export const OFFER_HOLD_DAYS = HOLD_DAYS.waitlistOffer;
export const OFFER_RESERVATION = 'waitlist_offer';

type Reader = PrismaClient | TransactionClient;
export type OfferWaiter = {
  id: string;
  who: string;
  preferred_term_months: number;
  customer_id: string | null;
};

/** Net monthly rent of a refurbished item at a waiter's term, no down payment. */
export function secondLifeRent(
  financedCents: number,
  termMonths: number,
  table: CoefficientTable
): number | null {
  const quoted = quoteFor({
    listPriceCents: financedCents,
    downPaymentCents: 0,
    termMonths,
    table,
  });
  return quoted.ok ? quoted.quote.monthlyNetRentCents : null;
}

/** Refurbished items listed in the catalogue and not held: what can complete a set now. */
export async function shelfItems(db: Reader): Promise<RefurbishedItem[]> {
  const rows = await db.asset.findMany({
    where: { status: 'available', second_life_price_cents: { not: null } },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    assetId: row.id,
    category: row.category as AssetCategory,
    condition: row.condition as AssetCondition,
    financedCents: row.second_life_price_cents!,
  }));
}

/**
 * Offers a set of items (one, or a whole multi-item set) to a waiter: each gets a 3-day offer
 * hold and an `offered_to_waiter` event, and the waiting-list entry becomes `offered`.
 * `offered_asset_id` holds one id (the item that triggered the offer); the holds list every
 * item.
 */
export async function offerSet(
  tx: TransactionClient,
  input: {
    waiter: OfferWaiter;
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
    data: { status: 'offered', offered_asset_id: input.items[0]?.assetId ?? null },
  });
}

/**
 * Passes refurbished items on (inside the caller's audited transaction): their holds end,
 * then each goes to the next person in line at its second-life price — alone, or with shelf
 * items as a whole set — or to the catalogue when nobody fits. `reason` is stamped on the
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
  const [table, assets, rows, shelf] = await Promise.all([
    loadCoefficientTable(),
    tx.asset.findMany({ where: { id: { in: input.assetIds } } }),
    tx.waitlistEntry.findMany({ where: { status: 'waiting' } }),
    shelfItems(tx),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const priced = assets.filter((a) => a.second_life_price_cents !== null);
  const batch = priced.map((a) => ({
    assetId: a.id,
    category: a.category as AssetCategory,
    condition: a.condition as AssetCondition,
    financedCents: a.second_life_price_cents!,
  }));
  const allocation = allocateRefurbished(
    batch,
    {
      asOfDate: input.asOf,
      demand: rows.map(toSecondLifeRequest),
      shelf: shelf.filter((s) => !input.assetIds.includes(s.assetId)),
    },
    table
  );
  const unpriced = assets
    .filter((a) => a.second_life_price_cents === null)
    .map((a) => ({ assetId: a.id, outcome: { kind: 'list_available' as const } }));
  const priceOf = new Map([...batch, ...shelf].map((i) => [i.assetId, i.financedCents]));

  const results: Array<{ assetId: string; outcome: HandoverAllocation['outcome'] }> = [];
  for (const { assetId, outcome } of [...allocation, ...unpriced]) {
    results.push({ assetId, outcome });
    if (outcome.kind === 'in_set') continue; // offered with the item that leads its set
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
    const items = [assetId, ...outcome.withAssetIds].map((id) => ({
      assetId: id,
      monthlyNetRentCents: secondLifeRent(priceOf.get(id)!, waiter.preferred_term_months, table),
    }));
    await offerSet(tx, { waiter, items, asOf: input.asOf });
  }
  return results;
}
