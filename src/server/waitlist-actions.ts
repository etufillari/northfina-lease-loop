// The customer side of the second-life waiting list, and what happens to an offer.
//
// - A customer joins with what they need (category, budget, minimum condition, term,
//   deadline, how many) and gets a place in the first-come-first-served queue.
// - When the desk offers them an item (or a full set), they accept — which starts a normal
//   application at the second-life price, no down payment, at their preferred term — or
//   decline. Signing the lease marks the entry `leased` (src/server/contracts.ts).
// - Declining, or letting the 7-day offer hold run out, takes them off the list and passes
//   the items to the next person in line. Expired holds are passed on by staff from the desk.
// Every change is one audited transaction.
import { loadCoefficientTable } from '@/data/load';
import type { AssetCategory, AssetCondition } from '@/data/schemas';
import type { PrismaClient, WaitlistEntry } from '@/generated/prisma/client';
import { startApplication } from './applications';
import { withAudit } from './audit';
import { OFFER_RESERVATION, passItemsOn, pooledAssetsByWaiter } from './second-life-pools';
import { STAFF_PERSONA as STAFF_ACTOR } from '@/components/persona-cookie';

type Db = PrismaClient;

/** Entry statuses that still hold a place or an offer. */
const OPEN = ['waiting', 'offered', 'accepted'];

export type JoinInput = {
  customerId: string;
  category: AssetCategory;
  maxMonthlyNetRentCents: number;
  /** The low end of the budget range; 0 means no lower bound. */
  minMonthlyNetRentCents?: number;
  minCondition: AssetCondition;
  preferredTermMonths: number;
  neededBy: string;
  quantity: number;
  actor: string;
  asOf: string;
};

export type JoinResult =
  | { ok: true; entry: WaitlistEntry }
  | {
      ok: false;
      reason: 'unknown_customer' | 'deadline_in_past' | 'unknown_term' | 'already_on_list';
    };

/** Joins the queue today (the as-of date): first come, first served on `joined_on`. */
export async function joinWaitlist(db: Db, input: JoinInput): Promise<JoinResult> {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) return { ok: false, reason: 'unknown_customer' };
  if (input.neededBy < input.asOf) return { ok: false, reason: 'deadline_in_past' };
  const table = await loadCoefficientTable();
  if (!(String(input.preferredTermMonths) in table.end_of_term_buyout_percent_of_financed)) {
    return { ok: false, reason: 'unknown_term' };
  }
  // One place per person per category: a second entry would let one person queue twice.
  const existing = await db.waitlistEntry.findFirst({
    where: { customer_id: customer.id, category: input.category, status: { in: OPEN } },
  });
  if (existing) return { ok: false, reason: 'already_on_list' };

  const id = `wait-${crypto.randomUUID().slice(0, 8)}`;
  const entry = await withAudit(
    db,
    {
      actor: input.actor,
      action: 'waitlist.joined',
      entityType: 'waitlist_entry',
      entityId: id,
      details: {
        customerId: customer.id,
        category: input.category,
        quantity: input.quantity,
        maxMonthlyNetRentCents: input.maxMonthlyNetRentCents,
      },
    },
    (tx) =>
      tx.waitlistEntry.create({
        data: {
          id,
          customer_id: customer.id,
          who: customer.name,
          category: input.category,
          max_monthly_net_rent_cents: input.maxMonthlyNetRentCents,
          min_monthly_net_rent_cents: input.minMonthlyNetRentCents ?? 0,
          min_condition: input.minCondition,
          preferred_term_months: input.preferredTermMonths,
          needed_by: input.neededBy,
          joined_on: input.asOf,
          quantity: input.quantity,
        },
      })
  );
  return { ok: true, entry };
}

type EntryFailure = 'not_found' | 'not_yours' | 'bad_status';

/** The entry, if the actor may act on it: its own customer, or staff. */
async function ownEntry(
  db: Db,
  entryId: string,
  actor: string,
  statuses: string[]
): Promise<{ ok: true; entry: WaitlistEntry } | { ok: false; reason: EntryFailure }> {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, reason: 'not_found' };
  if (actor !== STAFF_ACTOR && actor !== entry.customer_id)
    return { ok: false, reason: 'not_yours' };
  if (!statuses.includes(entry.status)) return { ok: false, reason: 'bad_status' };
  return { ok: true, entry };
}

/** The items currently offered to an entry, with the day their hold ends. */
export async function offeredItems(db: Db, entryId: string) {
  return db.reservation.findMany({
    where: { waitlist_entry_id: entryId, kind: OFFER_RESERVATION, active: true },
    orderBy: { asset_id: 'asc' },
  });
}

export type LeaveResult = { ok: true } | { ok: false; reason: EntryFailure };

/** Leaves the queue. Anything already held in a pool for them is passed on. */
export async function leaveWaitlist(
  db: Db,
  input: { entryId: string; actor: string; asOf: string }
): Promise<LeaveResult> {
  const found = await ownEntry(db, input.entryId, input.actor, ['waiting']);
  if (!found.ok) return found;
  const pooled = (await pooledAssetsByWaiter(db))[input.entryId] ?? [];
  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'waitlist.left',
      entityType: 'waitlist_entry',
      entityId: input.entryId,
      details: { pooledAssetIds: pooled },
    },
    async (tx) => {
      await tx.waitlistEntry.update({
        where: { id: input.entryId },
        data: { status: 'removed', left_reason: 'left' },
      });
      if (pooled.length > 0) {
        await passItemsOn(tx, { assetIds: pooled, asOf: input.asOf, reason: 'waiter_left' });
      }
    }
  );
  return { ok: true };
}

export type AcceptResult =
  | { ok: true; applicationId: string }
  | {
      ok: false;
      reason: EntryFailure | 'no_customer' | 'no_offer' | 'offer_expired' | (string & {});
    };

/**
 * Accepts an offer: a normal application for the offered item(s) at their second-life price,
 * no down payment, at the waiter's preferred term — so the rent is the one they were offered.
 * The application still goes through the whole question flow and eligibility check.
 */
export async function acceptOffer(
  db: Db,
  input: { entryId: string; actor: string; asOf: string }
): Promise<AcceptResult> {
  const found = await ownEntry(db, input.entryId, input.actor, ['offered']);
  if (!found.ok) return found;
  const { entry } = found;
  if (!entry.customer_id) return { ok: false, reason: 'no_customer' };
  const offers = await offeredItems(db, entry.id);
  if (offers.length === 0) return { ok: false, reason: 'no_offer' };
  if (offers.some((offer) => offer.until < input.asOf)) {
    return { ok: false, reason: 'offer_expired' };
  }

  const assetIds = offers.map((offer) => offer.asset_id);
  const started = await startApplication(db, {
    assetIds,
    downPaymentCents: 0,
    termMonths: entry.preferred_term_months,
    customerId: entry.customer_id,
    actor: input.actor,
    asOf: input.asOf,
  });
  if (!started.ok) return { ok: false, reason: started.reason };
  const applicationId = started.state.application.id;

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'waitlist.offer_accepted',
      entityType: 'waitlist_entry',
      entityId: entry.id,
      details: { assetIds, applicationId },
    },
    async (tx) => {
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'accepted' } });
      for (const assetId of assetIds) {
        await tx.assetEvent.create({
          data: {
            asset_id: assetId,
            type: 'offer_accepted',
            on_date: input.asOf,
            details_json: JSON.stringify({ waiterId: entry.id, who: entry.who, applicationId }),
          },
        });
      }
    }
  );
  return { ok: true, applicationId };
}

/** Ends an offer without a lease: the entry leaves the list, the items go to the next person. */
async function endOffer(
  db: Db,
  input: {
    entry: WaitlistEntry;
    assetIds: string[];
    reason: 'declined' | 'offer_expired';
    actor: string;
    asOf: string;
  }
) {
  const { entry, assetIds } = input;
  let passedOn: Awaited<ReturnType<typeof passItemsOn>> = [];
  await withAudit(
    db,
    {
      actor: input.actor,
      action: input.reason === 'declined' ? 'waitlist.offer_declined' : 'waitlist.offer_expired',
      entityType: 'waitlist_entry',
      entityId: entry.id,
      details: { assetIds },
    },
    async (tx) => {
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'removed', left_reason: input.reason },
      });
      for (const assetId of assetIds) {
        await tx.assetEvent.create({
          data: {
            asset_id: assetId,
            type: 'offer_ended',
            on_date: input.asOf,
            details_json: JSON.stringify({
              waiterId: entry.id,
              who: entry.who,
              reason: input.reason,
            }),
          },
        });
      }
      passedOn = await passItemsOn(tx, { assetIds, asOf: input.asOf, reason: input.reason });
    }
  );
  return passedOn;
}

export type DeclineResult =
  | { ok: true; passedOn: Awaited<ReturnType<typeof passItemsOn>> }
  | { ok: false; reason: EntryFailure | 'no_offer' };

/** Declines an offer (also after accepting, before signing). */
export async function declineOffer(
  db: Db,
  input: { entryId: string; actor: string; asOf: string }
): Promise<DeclineResult> {
  const found = await ownEntry(db, input.entryId, input.actor, ['offered', 'accepted']);
  if (!found.ok) return found;
  const offers = await offeredItems(db, found.entry.id);
  if (offers.length === 0) return { ok: false, reason: 'no_offer' };
  const passedOn = await endOffer(db, {
    entry: found.entry,
    assetIds: offers.map((offer) => offer.asset_id),
    reason: 'declined',
    actor: input.actor,
    asOf: input.asOf,
  });
  return { ok: true, passedOn };
}

export type ExpiredOffer = { entry: WaitlistEntry; assetIds: string[]; until: string };

/**
 * Offers whose 7-day hold ended before the as-of date without a lease in progress. An item
 * with an approved application (an approval or signatory hold) is not expired: the customer
 * is on their way to signing.
 */
export async function listExpiredOffers(db: Db, asOf: string): Promise<ExpiredOffer[]> {
  const offers = await db.reservation.findMany({
    where: { kind: OFFER_RESERVATION, active: true, until: { lt: asOf } },
    orderBy: { asset_id: 'asc' },
  });
  const inProgress = await db.reservation.findMany({
    where: {
      asset_id: { in: offers.map((o) => o.asset_id) },
      active: true,
      kind: { in: ['approval_hold', 'awaiting_signatory'] },
    },
  });
  const blocked = new Set(inProgress.map((hold) => hold.asset_id));
  const byEntry = new Map<string, { assetIds: string[]; until: string }>();
  for (const offer of offers) {
    if (!offer.waitlist_entry_id || blocked.has(offer.asset_id)) continue;
    const group = byEntry.get(offer.waitlist_entry_id) ?? { assetIds: [], until: offer.until };
    group.assetIds.push(offer.asset_id);
    byEntry.set(offer.waitlist_entry_id, group);
  }
  const entries = await db.waitlistEntry.findMany({
    where: { id: { in: [...byEntry.keys()] }, status: { in: ['offered', 'accepted'] } },
    orderBy: [{ joined_on: 'asc' }, { id: 'asc' }],
  });
  return entries.map((entry) => ({ entry, ...byEntry.get(entry.id)! }));
}

export type ExpireResult =
  | { ok: true; passedOn: Awaited<ReturnType<typeof passItemsOn>> }
  | { ok: false; reason: 'not_expired' };

/** Staff: ends an offer whose hold has run out and passes the items to the next person. */
export async function expireOffer(
  db: Db,
  input: { entryId: string; actor: string; asOf: string }
): Promise<ExpireResult> {
  const expired = (await listExpiredOffers(db, input.asOf)).find(
    (offer) => offer.entry.id === input.entryId
  );
  if (!expired) return { ok: false, reason: 'not_expired' };
  const passedOn = await endOffer(db, {
    entry: expired.entry,
    assetIds: expired.assetIds,
    reason: 'offer_expired',
    actor: input.actor,
    asOf: input.asOf,
  });
  return { ok: true, passedOn };
}
