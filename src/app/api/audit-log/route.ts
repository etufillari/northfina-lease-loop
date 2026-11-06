// GET /api/audit-log: the 50 newest audit rows, newest first. Staff only.
import { requireRole } from '@/server/auth/actor';
import { handleRoute, ok } from '@/server/api-response';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';

export const GET = handleRoute(async () => {
  await requireRole('audit_log.view');
  return ok(await listAuditLog(db, 50));
});
