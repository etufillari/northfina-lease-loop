// Holds lapse by themselves. Every hold has a last valid day (src/domain/holds.ts); the day
// after, the overnight run ends it:
// - an approved application nobody signed → `expired`, its items back in the catalogue
//   (releaseExpiredHolds);
// - a waiting-list offer nobody answered → the person leaves the list and the items go to the
//   next person in line, whose own offer can lapse in turn (expireOffer);
// - an end-of-term nomination nobody used → it ends; an item the desk already held for the
//   nominee goes to the waiting list (or the catalogue).
// In the demo the clock is the time-travel bar, so moving it forward runs the overnight job
// for each day on which something lapses, in date order and dated that day: what happens
// is what would have happened had the days passed one by one. Days with nothing lapsing are
// skipped. Staff can still release by hand from the desks.
import { lapsesOn } from '@/domain/holds';
import { addDays } from '@/domain/calendar';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from './audit';
import { NOMINATION_INVITE, NOMINATION_RESERVATION } from './nominations';
import { OFFER_RESERVATION, passItemsOn } from './second-life-offers';
import { EXPIRABLE_STATUSES, releaseExpiredHolds } from './staff-holds';
import { expireOffer, listExpiredOffers } from './waitlist-actions';

type Db = PrismaClient;

/** Who the audit log names for what lapses on its own. */
export const SYSTEM_ACTOR = 'system';

export type LapseSummary = {
  /** The days the overnight job ran on, in order. */
  days: string[];
  applications: Array<{ day: string; applicationId: string; releasedAssetIds: string[] }>;
  offers: Array<{ day: string; entryId: string; assetIds: string[] }>;
  nominations: Array<{ day: string; assetId: string }>;
};

/** The next day after `after` (and no later than `to`) on which some hold lapses. */
async function nextLapseDay(
  db: Db,
  input: { from: string; after: string; to: string }
): Promise<string | null> {
  const [applications, reservations] = await Promise.all([
    db.application.findMany({
      where: { status: { in: [...EXPIRABLE_STATUSES] }, hold_until: { lt: input.to } },
      select: { hold_until: true },
    }),
    db.reservation.findMany({
      where: {
        active: true,
        kind: { in: [OFFER_RESERVATION, NOMINATION_RESERVATION, NOMINATION_INVITE] },
        until: { lt: input.to },
      },
      select: { until: true },
    }),
  ]);
  const untils = [...applications.map((a) => a.hold_until!), ...reservations.map((r) => r.until)];
  // Anything that lapsed before the clock last moved is caught up on the first day.
  const firstDay = addDays(input.from, 1);
  const days = untils
    .map((until) => (lapsesOn(until) < firstDay ? firstDay : lapsesOn(until)))
    .filter((day) => day > input.after && day <= input.to)
    .sort();
  return days[0] ?? null;
}

/** The overnight job for one day: applications first, so an offer they blocked is freed. */
async function runDay(db: Db, day: string, actor: string, summary: LapseSummary) {
  summary.days.push(day);
  for (const released of await releaseExpiredHolds(db, { actor, asOf: day })) {
    summary.applications.push({
      day,
      applicationId: released.applicationId,
      releasedAssetIds: released.releasedAssetIds,
    });
  }
  for (const offer of await listExpiredOffers(db, day)) {
    const result = await expireOffer(db, { entryId: offer.entry.id, actor, asOf: day });
    if (result.ok) summary.offers.push({ day, entryId: offer.entry.id, assetIds: offer.assetIds });
  }
  const nominations = await db.reservation.findMany({
    where: {
      active: true,
      kind: { in: [NOMINATION_RESERVATION, NOMINATION_INVITE] },
      until: { lt: day },
    },
    orderBy: { asset_id: 'asc' },
  });
  for (const hold of nominations) {
    await withAudit(
      db,
      {
        actor,
        action: 'asset.nomination_lapsed',
        entityType: 'asset',
        entityId: hold.asset_id,
        details: { until: hold.until, customerId: hold.customer_id },
      },
      async (tx) => {
        await tx.reservation.update({ where: { id: hold.id }, data: { active: false } });
        // Already through the desk and held for the nominee: it goes to the waiting list
        // now. Still at the desk (or still on lease): nothing else changes.
        const asset = await tx.asset.findUnique({ where: { id: hold.asset_id } });
        const others = await tx.reservation.count({
          where: { asset_id: hold.asset_id, active: true },
        });
        if (asset?.status === 'reserved' && others === 0) {
          await passItemsOn(tx, {
            assetIds: [hold.asset_id],
            asOf: day,
            reason: 'nomination_lapsed',
          });
        }
      }
    );
    summary.nominations.push({ day, assetId: hold.asset_id });
  }
}

/**
 * Runs the overnight job for every day in (`from`, `to`] on which a hold lapses. Safe to run
 * again over the same days: what has lapsed is already gone.
 */
export async function expireLapsedHolds(
  db: Db,
  input: { from: string; to: string; actor?: string }
): Promise<LapseSummary> {
  const actor = input.actor ?? SYSTEM_ACTOR;
  const summary: LapseSummary = { days: [], applications: [], offers: [], nominations: [] };
  let after = input.from;
  for (;;) {
    const day = await nextLapseDay(db, { from: input.from, after, to: input.to });
    if (day === null) break;
    await runDay(db, day, actor, summary);
    after = day;
  }
  return summary;
}
