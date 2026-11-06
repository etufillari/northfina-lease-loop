// Who hears about a change. A notification goes to an address, and each person listens on the
// addresses that are theirs, so a customer can only ever receive their own messages. Dealers
// and signatories listen on nothing; admins hear about new manual review cases only.
import type { IdentitySummary } from './identity';

export type NotificationKind =
  | 'passed_to_you'
  | 'ready_for_you'
  | 'hold_ended'
  | 'application_approved'
  | 'application_rejected'
  | 'contract_signed'
  | 'lease_closed'
  | 'review_waiting';

/** The server sends a kind and the item's name, and the browser words it in the page language. */
export type AppNotification = { kind: NotificationKind; item: string };

export type AddressedNotification = AppNotification & { to: string };

export const ADMIN_ADDRESS = 'role:admin';

export const customerAddress = (customerId: string) => `customer:${customerId}`;

export function notificationAddresses(
  user: Pick<IdentitySummary, 'id' | 'role' | 'kind'>
): string[] {
  if (user.kind === 'customer') return [customerAddress(user.id)];
  return user.role === 'admin' ? [ADMIN_ADDRESS] : [];
}
