// POST /api/contracts/:id/invoices: generate the complete invoice schedule.
// GET /api/contracts/:id/invoices: return the persisted invoice schedule.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { generateInvoices, invoiceGenerationRequestSchema, listInvoices } from '@/server/invoices';
import { throwInvoiceError } from '@/server/invoice-errors';

type InvoiceRouteContext = RouteContext<'/api/contracts/[id]/invoices'>;

export const POST = handleRoute(async (request, { params }: InvoiceRouteContext) => {
  const { id } = await params;
  const body = await readJsonBody(request, invoiceGenerationRequestSchema);
  const result = await generateInvoices(db, { contractId: id, actor: body.actor });
  if (!result.ok) throwInvoiceError(result);

  return ok({ contractId: id, invoices: result.invoices }, { status: result.created ? 201 : 200 });
});

export const GET = handleRoute(async (_request, { params }: InvoiceRouteContext) => {
  const { id } = await params;
  const result = await listInvoices(db, id);
  if (!result.ok) throwInvoiceError(result);
  return ok({ contractId: id, invoices: result.invoices });
});
