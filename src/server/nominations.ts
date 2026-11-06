// End-of-term nominations ("pass it on", route b): the lessee names who should get the item
// next, and that person skips the waiting list. The 7 days (src/domain/holds.ts) start when
// the item COMES BACK, not when it is nominated: until then the item is still out on lease.
// - nominated during the lease: a provisional hold to 7 days after the term ends, restarted
//   on the actual return day (end of term or early exit);
// - nominated after the return: 7 days from the nomination;
// - bought out instead: the nomination ends.
// Back at the desk, a nominated item is refurbished and priced as usual and then held for the
// nominee instead of being matched to the waiting list (src/server/second-life.ts). A
// nomination nobody uses lapses and the item goes to the waiting list (hold-expiry.ts).
import { holdUntil } from '@/domain/holds';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';

export const NOMINATION_RESERVATION = 'nomination';
type Reader = PrismaClient | TransactionClient;

/** The item is back: every active nomination on it gets its full 7 days from today. */
export async function startNominationClock(
  tx: TransactionClient,
  input: { assetIds: string[]; returnedOn: string }
) {
  await tx.reservation.updateMany({
    where: { asset_id: { in: input.assetIds }, kind: NOMINATION_RESERVATION, active: true },
    data: { until: holdUntil('nomination', input.returnedOn) },
  });
}

/** The lessee bought the item: nobody else can be nominated for it. */
export async function endNominations(tx: TransactionClient, assetIds: string[]) {
  await tx.reservation.updateMany({
    where: { asset_id: { in: assetIds }, kind: NOMINATION_RESERVATION, active: true },
    data: { active: false },
  });
}

/** Asset id → the customer it is nominated for, for nominations still running on `asOf`. */
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
