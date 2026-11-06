// POST /api/contracts/close-expired
// Runs the scheduler's job now, for an admin: closes every contract past its choice window.
import { handleRoute, ok } from '@/server/api-response';
import { requireRole } from '@/server/auth/actor';
import { db } from '@/server/db';
import { closeDueContracts } from '@/server/end-of-term/contract-end';

export const POST = handleRoute(async () => {
  await requireRole('demo.configure');
  return ok(await closeDueContracts(db));
});
