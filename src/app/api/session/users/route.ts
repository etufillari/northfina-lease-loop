// GET /api/session/users → everyone who can "act as" in this demo: every customer plus
// every seeded staff member. Backs the "acting as" dropdown; see POST /api/session.
import { loadCustomers, loadStaff } from '@/data/load';
import { identitySummary, listIdentities } from '@/domain/identity';
import { handleRoute, ok } from '@/server/api-response';

export const GET = handleRoute(async () => {
  const [customers, staff] = await Promise.all([loadCustomers(), loadStaff()]);
  return ok(listIdentities(customers, staff).map(identitySummary));
});
