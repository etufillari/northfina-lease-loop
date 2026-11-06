import { loadVatRates } from '@/data/load';
import { db } from '@/server/db';
import { createEngineHttpHandlers } from '@/server/lease-engine/http';
import { demoCustomer } from '@/server/lease-engine/demo-access';
import { getInvoice } from '@/server/lease-engine/queries';
import { invoicePdf } from '@/server/invoice-pdf';
export async function GET(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  if (new URL(request.url).searchParams.get('format') === 'pdf') {
    const customer = await demoCustomer(request);
    const { invoiceId } = await context.params;
    const invoice = await getInvoice(db, invoiceId);
    const lease = await db.engineLease.findUnique({ where: { id: invoice.leaseId } });
    if (!lease || lease.customerId !== customer.id)
      return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(invoicePdf(invoice)), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${invoice.number}.pdf"`,
      },
    });
  }
  return createEngineHttpHandlers({
    db,
    resolvePrincipal: async (req) => {
      const customer = await demoCustomer(req);
      return { actorId: customer.id, role: 'customer', customerId: customer.id };
    },
    loadTaxRules: async () => (await loadVatRates()).rates,
  }).invoice(request, context);
}
