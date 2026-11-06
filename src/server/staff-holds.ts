// Holds that ran out. An approved application holds its items for 7 days; if nobody signs in
// time, signing is refused (signApplication) but the reservation would otherwise keep the
// items "reserved" forever. Staff release them here, one audited change per application.
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from '@/server/audit';
import { quoteAssetIds } from '@/server/quotes';
import { describeApplications, type StaffQueueItem } from '@/server/staff';

type Db = PrismaClient;

/**
 * Statuses whose hold can run out. A manual review is not here on purpose: the customer is
 * waiting for us, so the hold lasts until a person decides (approval restarts it).
 */
export const EXPIRABLE_STATUSES = ['approved', 'awaiting_signature'] as const;
export type ExpirableStatus = (typeof EXPIRABLE_STATUSES)[number];

/** Reservation kinds an application's approval creates. */
const HOLD_KINDS = ['approval_hold', 'awaiting_signatory'];

/** True when `asOf` is after the last day of the hold (the hold includes `holdUntil`). */
export function isHoldExpired(holdUntil: string | null, asOf: string): boolean {
  return holdUntil !== null && asOf > holdUntil;
}

// ISO dates compare as strings, so `lt` is "the hold's last day is before asOf".
function findExpired(db: Db, asOf: string) {
  return db.application.findMany({
    where: { status: { in: [...EXPIRABLE_STATUSES] }, hold_until: { lt: asOf } },
    include: { quote: true },
    orderBy: [{ hold_until: 'asc' }, { id: 'asc' }],
  });
}

/** Applications whose 7-day hold has run out without a signature, oldest hold first. */
export async function listExpiredHolds(
  db: Db,
  asOf: string
): Promise<StaffQueueItem<ExpirableStatus>[]> {
  return describeApplications<ExpirableStatus>(db, await findExpired(db, asOf));
}

export type ReleasedHold = {
  applicationId: string;
  /** Items that went back to `available`. */
  releasedAssetIds: string[];
  /** Items still held by someone else, so they stay reserved. */
  stillHeldAssetIds: string[];
};

/**
 * Releases every expired hold as of `asOf`: the application becomes `expired`, its
 * reservations end, and each item goes back to `available` unless another hold is still
 * active on it. Each application is its own transaction with its own audit row, so one
 * failure cannot undo the others, and the log shows exactly which hold was released.
 */
export async function releaseExpiredHolds(
  db: Db,
  input: { actor: string; asOf: string }
): Promise<ReleasedHold[]> {
  const expired = await findExpired(db, input.asOf);

  const released: ReleasedHold[] = [];
  for (const application of expired) {
    const assetIds = quoteAssetIds(application.quote);
    const result: ReleasedHold = {
      applicationId: application.id,
      releasedAssetIds: [],
      stillHeldAssetIds: [],
    };
    await withAudit(
      db,
      {
        actor: input.actor,
        action: 'application.hold_expired',
        entityType: 'application',
        entityId: application.id,
        details: {
          from: application.status,
          to: 'expired',
          holdUntil: application.hold_until,
          assetIds,
        },
      },
      async (tx) => {
        // Re-check inside the transaction: someone may have signed in the meantime.
        const fresh = await tx.application.findUnique({ where: { id: application.id } });
        if (!fresh || !(EXPIRABLE_STATUSES as readonly string[]).includes(fresh.status)) {
          throw new HoldChanged();
        }
        await tx.application.update({
          where: { id: application.id },
          data: { status: 'expired' },
        });
        for (const assetId of assetIds) {
          await tx.reservation.updateMany({
            where: {
              asset_id: assetId,
              customer_id: application.customer_id,
              kind: { in: HOLD_KINDS },
              active: true,
            },
            data: { active: false },
          });
          const otherHolds = await tx.reservation.count({
            where: { asset_id: assetId, active: true },
          });
          const asset = await tx.asset.findUnique({ where: { id: assetId } });
          if (otherHolds === 0 && asset?.status === 'reserved') {
            await tx.asset.update({ where: { id: assetId }, data: { status: 'available' } });
            result.releasedAssetIds.push(assetId);
          } else {
            result.stillHeldAssetIds.push(assetId);
          }
        }
      }
    ).then(
      () => released.push(result),
      (error: unknown) => {
        // A hold signed between the read and the write is simply not expired any more.
        if (!(error instanceof HoldChanged)) throw error;
      }
    );
  }
  return released;
}

/** Thrown inside the transaction to roll it back when the application changed under us. */
class HoldChanged extends Error {}
