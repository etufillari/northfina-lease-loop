// End-of-lease nominations ("pass it on", route b). The lessee names who should get the
// item next; the nominee must ACCEPT; once accepted they get the first claim on the item
// when it is ready to lease again, ahead of the waiting list.
//
// 1. Nominate (any time during the lease, or after the return): an invitation
//    (`nomination_invite`). It reserves nothing — other people are not blocked by it.
// 2. Accept: the invitation becomes a `nomination`. While the item is still out on lease or
//    at the second-life desk it waits with no deadline (UNTIL_ITEM_READY); if the item is
//    already back in the catalogue it is held for the nominee from today.
// 3. Ready: the desk refurbishes and prices the item as usual, then holds it for the
//    nominee instead of matching the waiting list, and their 3 days start
//    (src/domain/holds.ts). Only the nominee can apply; unused, the nomination lapses and
//    the item goes to the waiting list (hold-expiry.ts).
// An invitation nobody answered before the item is ready simply ends: the desk treats the
// item like any other. Buying the item, or passing the lease on, ends both.
import { holdUntil, UNTIL_ITEM_READY } from '@/domain/holds';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit, type TransactionClient } from './audit';

export const NOMINATION_RESERVATION = 'nomination';
export const NOMINATION_INVITE = 'nomination_invite';
const BOTH = [NOMINATION_RESERVATION, NOMINATION_INVITE];
type Reader = PrismaClient | TransactionClient;

/** Ends every invitation and nomination on these items (bought, passed on, or replaced). */
export async function endNominations(tx: TransactionClient, assetIds: string[]) {
  await tx.reservation.updateMany({
    where: { asset_id: { in: assetIds }, kind: { in: BOTH }, active: true },
    data: { active: false },
  });
}

/** True when an invitation or an accepted nomination is running on any of these items. */
export async function hasNomination(db: Reader, assetIds: string[]): Promise<boolean> {
  const count = await db.reservation.count({
    where: { asset_id: { in: assetIds }, kind: { in: BOTH }, active: true },
  });
  return count > 0;
}

/**
 * The desk is done and holds the item for its nominee: the nominee's days start today, and
 * an invitation nobody accepted in time ends.
 */
export async function startNomineeClock(tx: TransactionClient, assetId: string, asOf: string) {
  await tx.reservation.updateMany({
    where: { asset_id: assetId, kind: NOMINATION_RESERVATION, active: true },
    data: { until: holdUntil('nomination', asOf) },
  });
  await tx.reservation.updateMany({
    where: { asset_id: assetId, kind: NOMINATION_INVITE, active: true },
    data: { active: false },
  });
}

/** Asset id → the customer an ACCEPTED nomination names, for nominations still running. */
export async function nomineesByAsset(
  db: Reader,
  assetIds: string[],
  asOf: string
): Promise<Record<string, string>> {
  const holds = await db.reservation.findMany({
    where: {
      asset_id: { in: assetIds },
      kind: NOMINATION_RESERVATION,
      active: true,
      customer_id: { not: null },
      until: { gte: asOf },
    },
    orderBy: { id: 'desc' },
  });
  const nominees: Record<string, string> = {};
  for (const hold of holds) nominees[hold.asset_id] ??= hold.customer_id!;
  return nominees;
}

export type NominationAnswerResult =
  | { ok: true; heldNow: boolean }
  | { ok: false; reason: 'no_invitation' | 'expired' | 'no_longer_available' };

/**
 * The nominee accepts or declines their invitation for one item. Accepting while the item is
 * already listed holds it for them right away (3 days); while it is out on lease or at the
 * desk the nomination waits for the desk.
 */
export async function answerNomination(
  db: PrismaClient,
  input: { assetId: string; customerId: string; accept: boolean; asOf: string }
): Promise<NominationAnswerResult> {
  const invite = await db.reservation.findFirst({
    where: {
      asset_id: input.assetId,
      customer_id: input.customerId,
      kind: NOMINATION_INVITE,
      active: true,
    },
    orderBy: { id: 'desc' },
  });
  if (!invite) return { ok: false, reason: 'no_invitation' };
  if (invite.until < input.asOf) return { ok: false, reason: 'expired' };

  const asset = await db.asset.findUniqueOrThrow({ where: { id: input.assetId } });
  const otherHolds = await db.reservation.count({
    where: { asset_id: input.assetId, active: true, id: { not: invite.id } },
  });
  const waiting = asset.status === 'leased' || asset.status === 'returned';
  const listedFree = asset.status === 'available' && otherHolds === 0;
  if (input.accept && !waiting && !listedFree) {
    // Sold, or meanwhile reserved for someone else: the invitation can no longer be used.
    await withAudit(
      db,
      {
        actor: input.customerId,
        action: 'nomination.unavailable',
        entityType: 'asset',
        entityId: input.assetId,
        details: { status: asset.status },
      },
      (tx) => tx.reservation.update({ where: { id: invite.id }, data: { active: false } })
    );
    return { ok: false, reason: 'no_longer_available' };
  }

  await withAudit(
    db,
    {
      actor: input.customerId,
      action: input.accept ? 'nomination.accepted' : 'nomination.declined',
      entityType: 'asset',
      entityId: input.assetId,
      details: { status: asset.status },
    },
    async (tx) => {
      if (!input.accept) {
        await tx.reservation.update({ where: { id: invite.id }, data: { active: false } });
        return;
      }
      await tx.reservation.update({
        where: { id: invite.id },
        data: {
          kind: NOMINATION_RESERVATION,
          until: waiting ? UNTIL_ITEM_READY : holdUntil('nomination', input.asOf),
        },
      });
      if (listedFree) {
        await tx.asset.update({ where: { id: input.assetId }, data: { status: 'reserved' } });
      }
    }
  );
  return { ok: true, heldNow: input.accept && listedFree };
}

export type NominationView = {
  assetId: string;
  make: string;
  model: string;
  /** Who nominated them: the last lessee of the item. */
  fromName: string | null;
  status: 'invited' | 'accepted_waiting' | 'held';
  /** For a held item: the last day to apply. */
  until: string | null;
};

/** A customer's open invitations and accepted nominations, for "My page". */
export async function nominationsFor(db: Reader, customerId: string): Promise<NominationView[]> {
  const holds = await db.reservation.findMany({
    where: { customer_id: customerId, kind: { in: BOTH }, active: true },
    orderBy: { id: 'asc' },
  });
  const views: NominationView[] = [];
  for (const hold of holds) {
    const asset = await db.asset.findUnique({ where: { id: hold.asset_id } });
    const lastLease = await db.contractAsset.findFirst({
      where: { asset_id: hold.asset_id },
      include: { contract: true },
      orderBy: { contract: { created_at: 'desc' } },
    });
    const from = lastLease
      ? await db.customer.findUnique({ where: { id: lastLease.contract.customer_id } })
      : null;
    views.push({
      assetId: hold.asset_id,
      make: asset?.make ?? '',
      model: asset?.model ?? '',
      fromName: from?.name ?? null,
      status:
        hold.kind === NOMINATION_INVITE
          ? 'invited'
          : hold.until === UNTIL_ITEM_READY
            ? 'accepted_waiting'
            : 'held',
      until:
        hold.kind === NOMINATION_RESERVATION && hold.until !== UNTIL_ITEM_READY ? hold.until : null,
    });
  }
  return views;
}
