import { handleRoute, ok } from '@/server/api-response';
import { requireStaff } from '@/server/auth-session';
import { db } from '@/server/db';
import { listReturnCases } from '@/server/recovery';

export const GET = handleRoute(async (request) => {
  await requireStaff(db, request.headers);
  return ok(await listReturnCases(db), { headers: { 'Cache-Control': 'no-store' } });
});
