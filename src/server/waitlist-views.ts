// Read models for the waiting-list pages: a customer's own entries (place in the queue, offers
// with their rent and hold date, set progress) and the whole list for staff. Changes nothing.
import type { PrismaClient, WaitlistEntry } from '@/generated/prisma/client';
import { OFFER_RESERVATION, pooledAssetsByWaiter } from './second-life-pools';

type Db = PrismaClient;

export type OfferedItem = {
  assetId: string;
  make: string;
  model: string;
  condition: string;
  /** Net monthly rent at the waiter's preferred term, as offered. */
  monthlyNetRentCents: number | null;
};

export type WaitlistView = {
  entry: WaitlistEntry;
  /** 1-based place among people still waiting for this category; null once offered or gone. */
  position: number | null;
  offer: { items: OfferedItem[]; until: string; expired: boolean } | null;
  /** Items already held for a multi-item entry. */
  pooledAssetIds: string[];
  /** The application started by accepting the offer. */
  applicationId: string | null;
};

function detailsOf(json: string | null): Record<string, unknown> {
  const value: unknown = json ? JSON.parse(json) : null;
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** First come, first served on joined_on, id as the tie-break (as the matcher does). */
const before = (a: WaitlistEntry, b: WaitlistEntry) =>
  a.joined_on < b.joined_on || (a.joined_on === b.joined_on && a.id < b.id);

async function buildViews(db: Db, entries: WaitlistEntry[], asOf: string) {
  const [waiting, pools] = await Promise.all([
    db.waitlistEntry.findMany({ where: { status: 'waiting', needed_by: { gte: asOf } } }),
    pooledAssetsByWaiter(db),
  ]);
  const views: WaitlistView[] = [];
  for (const entry of entries) {
    const position =
      entry.status === 'waiting' && entry.needed_by >= asOf
        ? waiting.filter((w) => w.category === entry.category && before(w, entry)).length + 1
        : null;

    let offer: WaitlistView['offer'] = null;
    let applicationId: string | null = null;
    if (entry.status === 'offered' || entry.status === 'accepted') {
      const holds = await db.reservation.findMany({
        where: { waitlist_entry_id: entry.id, kind: OFFER_RESERVATION, active: true },
        orderBy: { asset_id: 'asc' },
      });
      const items: OfferedItem[] = [];
      for (const hold of holds) {
        const asset = await db.asset.findUnique({ where: { id: hold.asset_id } });
        const offered = await db.assetEvent.findFirst({
          where: { asset_id: hold.asset_id, type: 'offered_to_waiter' },
          orderBy: [{ on_date: 'desc' }, { id: 'desc' }],
        });
        const rent = detailsOf(offered?.details_json ?? null).monthlyNetRentCents;
        items.push({
          assetId: hold.asset_id,
          make: asset?.make ?? '',
          model: asset?.model ?? '',
          condition: asset?.condition ?? '',
          monthlyNetRentCents: typeof rent === 'number' ? rent : null,
        });
        if (applicationId === null && entry.status === 'accepted') {
          const accepted = await db.assetEvent.findFirst({
            where: { asset_id: hold.asset_id, type: 'offer_accepted' },
            orderBy: [{ on_date: 'desc' }, { id: 'desc' }],
          });
          const id = detailsOf(accepted?.details_json ?? null).applicationId;
          applicationId = typeof id === 'string' ? id : null;
        }
      }
      const until = holds[0]?.until ?? '';
      if (holds.length > 0) offer = { items, until, expired: until < asOf };
    }
    views.push({
      entry,
      position,
      offer,
      pooledAssetIds: pools[entry.id] ?? [],
      applicationId,
    });
  }
  return views;
}

/** One customer's entries, newest first. */
export async function customerWaitlist(
  db: Db,
  customerId: string,
  asOf: string
): Promise<WaitlistView[]> {
  const entries = await db.waitlistEntry.findMany({
    where: { customer_id: customerId },
    orderBy: [{ joined_on: 'desc' }, { id: 'desc' }],
  });
  return buildViews(db, entries, asOf);
}

/** The whole list for staff, by category, in queue order. */
export async function staffWaitlist(db: Db, asOf: string): Promise<WaitlistView[]> {
  const entries = await db.waitlistEntry.findMany({
    orderBy: [{ category: 'asc' }, { joined_on: 'asc' }, { id: 'asc' }],
  });
  return buildViews(db, entries, asOf);
}
