// Who is using the app: a guest, one of the data pack's customers, or Lease Loop staff.
//
// This is a DEMO identity, not security: the choice is a cookie anyone can change, like the
// time-travel date. It decides whose answers are pre-filled and whose contracts are shown.
// A real app would put a proper login here.
import type { Customer } from '@/data/schemas';

export const VIEWER_COOKIE = 'lease-loop-viewer';
export const STAFF = 'staff';

export type Viewer =
  { kind: 'guest' } | { kind: 'staff' } | { kind: 'customer'; customer: Customer };

/** Turns the cookie value into a viewer. Anything unknown means guest. */
export function resolveViewer(
  cookieValue: string | undefined,
  customers: readonly Customer[]
): Viewer {
  if (cookieValue === STAFF) return { kind: 'staff' };
  const customer = customers.find((c) => c.id === cookieValue);
  return customer ? { kind: 'customer', customer } : { kind: 'guest' };
}

/** The customer id to record on new applications: the customer's, or none for guests and staff. */
export function viewerCustomerId(viewer: Viewer): string | null {
  return viewer.kind === 'customer' ? viewer.customer.id : null;
}

/**
 * Whether the viewer may see an application or contract owned by `ownerCustomerId`
 * (`null` = made by a guest). Staff see everything; customers see their own; guests see
 * guest-made ones.
 */
export function canSee(viewer: Viewer, ownerCustomerId: string | null): boolean {
  if (viewer.kind === 'staff') return true;
  return viewerCustomerId(viewer) === ownerCustomerId;
}
