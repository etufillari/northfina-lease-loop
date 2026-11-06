// Read models for the waiting-list pages: a customer's own entries (what they wait for, offers
// with their rent and hold date) and the whole list for staff. Changes nothing. The place in
// the queue is deliberately not shown: it moves for reasons the customer cannot see (people
// ahead who do not fit an item, sets that skip a turn).
import type { PrismaClient, WaitlistEntry } from '@/generated/prisma/client';
import { OFFER_RESERVATION } from './second-life-offers';

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
  /** Still waiting, but the needed-by date has passed, so they are no longer matched. */
  pastDeadline: boolean;
  offer: { items: OfferedItem[]; until: string; expired: boolean } | null;
  /** The application started by accepting the offer. */
  applicationId: string | null;
};

function detailsOf(json: string | null): Record<string, unknown> {
  const value: unknown = json ? JSON.parse(json) : null;
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

async function buildViews(db: Db, entries: WaitlistEntry[], asOf: string) {
  const views: WaitlistView[] = [];
  for (const entry of entries) {
    const pastDeadline = entry.status === 'waiting' && entry.needed_by < asOf;

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
      pastDeadline,
      offer,
      applicationId,
    });
  }
  return views;
}

/**
 * One customer's open entries, newest first: still waiting, or with an offer (or the
 * application it started). Entries they left, declined, let lapse or leased are not shown.
 */
export async function customerWaitlist(
  db: Db,
  customerId: string,
  asOf: string
): Promise<WaitlistView[]> {
  const entries = await db.waitlistEntry.findMany({
    where: { customer_id: customerId, status: { in: ['waiting', 'offered', 'accepted'] } },
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
