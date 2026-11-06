import { z } from 'zod';
import { handleRoute } from '@/server/api-response';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
import { respondEngineOperation } from '@/server/lease-engine/http';
import { previewEarlyExit } from '@/server/circular/exit-quote';
import { db } from '@/server/db';
export const GET = handleRoute(
  async (request, { params }: RouteContext<'/api/leases/[leaseId]/exit-quote'>) => {
    const { leaseId } = await params;
    await demoLeasePrincipal(request, leaseId);
    const elapsed = z.coerce
      .number()
      .int()
      .min(1)
      .max(47)
      .parse(new URL(request.url).searchParams.get('elapsedMonths'));
    return respondEngineOperation(() => previewEarlyExit(db, leaseId, elapsed));
  }
);
