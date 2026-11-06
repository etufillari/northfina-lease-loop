// POST /api/contracts/:id/invoices/:invoiceId/payments: record one payment.
// GET /api/contracts/:id/invoices/:invoiceId/payments: return payment history and balance.
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { throwPaymentError } from '@/server/payment-errors';
import { listInvoicePayments, paymentRequestSchema, recordPayment } from '@/server/payments';

type PaymentRouteContext = RouteContext<'/api/contracts/[id]/invoices/[invoiceId]/payments'>;

export const POST = handleRoute(async (request, { params }: PaymentRouteContext) => {
  const { id, invoiceId } = await params;
  const body = await readJsonBody(request, paymentRequestSchema);
  const result = await recordPayment(db, { ...body, contractId: id, invoiceId });
  if (!result.ok) throwPaymentError(result);

  return ok(
    { contractId: id, invoiceId, payment: result.payment, invoice: result.invoice },
    { status: 201 }
  );
});

export const GET = handleRoute(async (_request, { params }: PaymentRouteContext) => {
  const { id, invoiceId } = await params;
  const result = await listInvoicePayments(db, { contractId: id, invoiceId });
  if (!result.ok) throwPaymentError(result);

  return ok({ contractId: id, invoiceId, invoice: result.invoice });
});
