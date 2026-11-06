// Can this customer claim this item right now — start, submit, approve or sign a lease on
// it? One rule, used at every step, so two people can never end up holding (or signing)
// the same physical item:
// - a leased or sold item is never claimable;
// - an active hold for SOMEONE ELSE blocks everyone else (an approval, a signatory wait, a
//   waiting-list offer, a nomination — whatever its kind);
// - a returned item is in maintenance at the second-life desk: nobody can claim it, not even
//   a nominated successor — the desk refurbishes it first, then holds it for them;
// - a reserved item is claimable only by the customer a hold names.
// Holds whose last day has passed no longer count, even before the lapse job has run.
import { isLapsed } from './holds';

export type ClaimHold = {
  kind: string;
  /** The customer the hold is for; null for a nomination of someone without an account. */
  customerId: string | null;
  /** The hold's last valid day. */
  until: string;
};

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'leased_or_sold' | 'held_for_someone_else' | 'in_maintenance' };

export function canClaim(
  asset: { status: string },
  activeHolds: readonly ClaimHold[],
  customerId: string,
  asOf: string
): ClaimResult {
  if (asset.status === 'leased' || asset.status === 'sold') {
    return { ok: false, reason: 'leased_or_sold' };
  }
  if (asset.status === 'returned') return { ok: false, reason: 'in_maintenance' };
  // A nomination invitation nobody accepted yet reserves nothing.
  const live = activeHolds.filter(
    (hold) => hold.kind !== 'nomination_invite' && !isLapsed(hold.until, asOf)
  );
  if (live.some((hold) => hold.customerId !== customerId)) {
    return { ok: false, reason: 'held_for_someone_else' };
  }
  const mine = live.filter((hold) => hold.customerId === customerId);
  if (asset.status === 'reserved' && mine.length === 0) {
    return { ok: false, reason: 'held_for_someone_else' };
  }
  return { ok: true };
}
