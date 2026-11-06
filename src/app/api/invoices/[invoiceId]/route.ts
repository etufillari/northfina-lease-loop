import { loadVatRates } from '@/data/load';
import { db } from '@/server/db';
import { createEngineHttpHandlers } from '@/server/lease-engine/http';
import { demoCustomer } from '@/server/lease-engine/demo-access';
export async function GET(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  return createEngineHttpHandlers({
    db,
    resolvePrincipal: async (req) => {
      const customer = await demoCustomer(req);
      return { actorId: customer.id, role: 'customer', customerId: customer.id };
    },
    loadTaxRules: async () => (await loadVatRates()).rates,
  }).invoice(request, context);
}
