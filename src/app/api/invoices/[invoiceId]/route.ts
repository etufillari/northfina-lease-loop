import { ApiError, handleRoute } from '@/server/api-response';
import { toInvoiceDTO } from '@/server/lease-engine/contracts';
import { loadVatRates } from '@/data/load';
import { db } from '@/server/db';
import { createEngineHttpHandlers } from '@/server/lease-engine/http';
import { demoCustomer } from '@/server/lease-engine/demo-access';
import { invoicePdf } from '@/server/invoice-pdf';
export const GET = handleRoute(
  async (request: Request, context: { params: Promise<{ invoiceId: string }> }) => {
    if (new URL(request.url).searchParams.get('format') === 'pdf') {
      const customer = await demoCustomer(request);
      const { invoiceId } = await context.params;
      const row = await db.engineInvoice.findFirst({
        where: { id: invoiceId, lease: { customerId: customer.id } },
      });
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found');
      const invoice = toInvoiceDTO(row);
      return new Response(Buffer.from(invoicePdf(invoice)), {
        headers: {
          'content-type': 'application/pdf',
          'cache-control': 'private, no-store',
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
);
