// Where the demo bar goes after switching persona. Most pages simply refresh for the new
// persona, but a page about one record (an application, a lease, a return) belongs to the
// previous persona and would be "not found" for the new one, and staff pages are only for staff.

const recordPage = /^\/[^/]+\/(applications\/[^/]+|account\/leases\/[^/]+)(\/|$)/;
const staffPage = /^\/[^/]+\/staff(\/|$)/;

/** The path to open after switching, or null to stay on the current page. */
export function landingAfterSwitch(
  pathname: string,
  next: { staff: boolean; cartCount: number }
): string | null {
  const locale = pathname.split('/')[1];
  if (!locale) return null;
  const leaves = recordPage.test(pathname) || (staffPage.test(pathname) && !next.staff);
  if (!leaves) return null;
  // Start the new persona where their scenario starts: their cart if it has their item.
  return next.cartCount > 0 ? `/${locale}/cart` : `/${locale}/account/leases`;
}
