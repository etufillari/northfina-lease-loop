import { loadVatRates } from '@/data/load';
import { db } from '@/server/db';
import { createEngineHttpHandlers } from '@/server/lease-engine/http';
import { demoLeasePrincipal } from '@/server/lease-engine/demo-access';

type Context = { params: Promise<{ leaseId: string }> };
export async function GET(request: Request, context: Context) {
  const { leaseId } = await context.params;
  return createEngineHttpHandlers({
    db,
    resolvePrincipal: (req) => demoLeasePrincipal(req, leaseId),
    loadTaxRules: async () => (await loadVatRates()).rates,
  }).invoices(request, context);
}
export async function POST(request: Request, context: Context) {
  const { leaseId } = await context.params;
  return createEngineHttpHandlers({
    db,
    resolvePrincipal: (req) => demoLeasePrincipal(req, leaseId, true),
    loadTaxRules: async () => (await loadVatRates()).rates,
  }).issue(request, context);
}
