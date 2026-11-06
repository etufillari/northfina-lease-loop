// Who can lease an item: anyone when it is available, and only the customer it is held for when
// it is reserved for someone (an item passed on to them). Leased, returned and sold items, and
// the data pack's own reservations (held for nobody we know), can't be leased.
import type { AssetStatus } from '@/data/schemas';

export function canBeLeasedBy(
  item: { status: AssetStatus; reservedFor: string | null },
  customerId: string | null
): boolean {
  if (item.status === 'available') return true;
  return item.status === 'reserved' && item.reservedFor !== null && item.reservedFor === customerId;
}
