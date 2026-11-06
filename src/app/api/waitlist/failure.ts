// One mapping from waiting-list failure reasons to API errors, shared by the waitlist routes.
import { fail } from '@/server/api-response';

const FAILURES: Record<string, [number, string, string]> = {
  not_found: [404, 'WAITLIST_ENTRY_NOT_FOUND', 'No such waiting-list entry'],
  not_yours: [403, 'NOT_YOUR_ENTRY', 'Only the customer on this entry (or staff) can do this'],
  bad_status: [409, 'BAD_STATUS', 'This entry cannot do that in its current state'],
  no_customer: [409, 'NO_CUSTOMER', 'This entry has no customer account to apply with'],
  no_offer: [409, 'NO_OFFER', 'Nothing is offered to this entry right now'],
  offer_expired: [409, 'OFFER_EXPIRED', 'The 3-day hold on this offer has ended'],
  not_expired: [409, 'OFFER_NOT_EXPIRED', 'This offer is still within its 3-day hold'],
  unknown_customer: [404, 'CUSTOMER_NOT_FOUND', 'No such customer'],
  deadline_in_past: [422, 'DEADLINE_IN_PAST', 'The needed-by date is already past'],
  unknown_term: [422, 'UNKNOWN_TERM', 'Terms are 12, 24, 36 or 48 months'],
  already_on_list: [409, 'ALREADY_ON_LIST', 'You are already on the list for this category'],
  asset_unavailable: [409, 'ASSET_UNAVAILABLE', 'The offered item is no longer available'],
};

export function waitlistFailure(reason: string): Response {
  const known = FAILURES[reason];
  if (known) return fail(...known);
  return fail(422, 'CANNOT_APPLY', 'The application could not be started', { reason });
}
