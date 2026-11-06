// GET /api/audit-log[?page=1&pageSize=100&type=asset&entity=ebike-007]: the whole audit log,
// newest first, one page at a time. `type` and `entity` filter across every row.
import { z } from 'zod';
import { pageAuditLog } from '@/server/audit';
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';

const paramsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  type: z.string().min(1).max(50).optional(),
  entity: z.string().min(1).max(100).optional(),
});

export const GET = handleRoute(async (request) => {
  const parsed = paramsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail(400, 'VALIDATION_ERROR', 'Bad audit-log parameters');
  const { page, pageSize, type, entity } = parsed.data;
  return ok(await pageAuditLog(db, { page, pageSize, entityType: type, entityId: entity }));
});
