// Loads what `canClaim` (src/domain/claims.ts) needs — each item's status and its active
// holds — and answers for a whole group of items at once (a fleet is claimed together).
import { canClaim, type ClaimResult } from '@/domain/claims';
import type { PrismaClient } from '@/generated/prisma/client';
import type { TransactionClient } from './audit';

type Reader = PrismaClient | TransactionClient;

/** Ok only when the customer can claim EVERY item; otherwise the first item's reason. */
export async function checkClaim(
  db: Reader,
  input: { assetIds: string[]; customerId: string; asOf: string }
): Promise<ClaimResult> {
  const [assets, holds] = await Promise.all([
    db.asset.findMany({ where: { id: { in: input.assetIds } } }),
    db.reservation.findMany({ where: { asset_id: { in: input.assetIds }, active: true } }),
  ]);
  for (const id of input.assetIds) {
    const asset = assets.find((a) => a.id === id);
    if (!asset) return { ok: false, reason: 'leased_or_sold' };
    const result = canClaim(
      asset,
      holds
        .filter((hold) => hold.asset_id === id)
        .map((hold) => ({ kind: hold.kind, customerId: hold.customer_id, until: hold.until })),
      input.customerId,
      input.asOf
    );
    if (!result.ok) return result;
  }
  return { ok: true };
}
