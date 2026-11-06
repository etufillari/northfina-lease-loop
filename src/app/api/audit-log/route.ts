// GET /api/audit-log: the 50 newest audit rows, newest first.
import { handleRoute, ok } from '@/server/api-response';
import { listAuditLog } from '@/server/audit';
import { requireStaff } from '@/server/auth-session';
import { db } from '@/server/db';

export const GET = handleRoute(async (request) => {
  await requireStaff(db, request.headers);
  return ok(await listAuditLog(db, 50), { headers: { 'Cache-Control': 'no-store' } });
});
