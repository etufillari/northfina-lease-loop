// GET /api/session/users → everyone who can "act as" in this demo: every customer, staff
// member and signatory. Backs the "acting as" dropdown; see POST /api/session.
import { loadCustomers, loadSignatories, loadStaff } from '@/data/load';
import { identitySummary, listIdentities } from '@/domain/identity';
import { handleRoute, ok } from '@/server/api-response';

export const GET = handleRoute(async () => {
  const [customers, staff, signatories] = await Promise.all([
    loadCustomers(),
    loadStaff(),
    loadSignatories(),
  ]);
  return ok(listIdentities(customers, staff, signatories).map(identitySummary));
});
