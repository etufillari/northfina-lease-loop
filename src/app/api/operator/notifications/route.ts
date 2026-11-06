import { handleRoute, ok } from '@/server/api-response';
import { demoCompanyOperator } from '@/server/circular/demo-operator';
import { pendingReturnNotifications } from '@/server/circular/notifications';
import { db } from '@/server/db';
export const GET = handleRoute(async (request) => {
  demoCompanyOperator(request);
  return ok(await pendingReturnNotifications(db), { headers: { 'Cache-Control': 'no-store' } });
});
