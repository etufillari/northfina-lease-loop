import { loadVatRates } from '@/data/load';
import { db } from '@/server/db';
import { createEngineHttpHandlers } from '@/server/lease-engine/http';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';
export async function GET(request: Request, context: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await context.params;
  return createEngineHttpHandlers({
    db,
    resolvePrincipal: (req) => demoLeasePrincipal(req, leaseId),
    loadTaxRules: async () => (await loadVatRates()).rates,
  }).schedule(request, context);
}
