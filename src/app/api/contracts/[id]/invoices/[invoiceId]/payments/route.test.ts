import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvoicePaymentsResult, PaymentRecordingResult } from '@/server/payments/payments';
import type { InvoiceRecord, PaymentRecord } from '@/server/invoicing/invoice-record';

const { listInvoicePaymentsMock, recordPaymentMock } = vi.hoisted(() => ({
  listInvoicePaymentsMock: vi.fn(),
  recordPaymentMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/payments/payments', async () => {
  const { z } = await import('zod');
  return {
    listInvoicePayments: listInvoicePaymentsMock,
    recordPayment: recordPaymentMock,
    paymentRequestSchema: z.strictObject({
      amountCents: z.number().int().positive(),
      paidOn: z.iso.date(),
      reference: z.string().trim().max(200).optional(),
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { GET, POST } from './route';

const payment: PaymentRecord = {
  id: 'payment-1',
  invoiceId: 'invoice-1',
  amountCents: 5_000,
  paidOn: '2026-11-05',
  reference: 'bank-001',
  createdAt: '2026-11-05T12:00:00.000Z',
};

const invoice: InvoiceRecord = {
  id: 'invoice-1',
  contractId: 'contract-1',
  sequence: 1,
  status: 'issued',
  paymentStatus: 'partially_paid',
  totalPaidCents: 5_000,
  remainingCents: 8_466,
  isOverdue: false,
  payments: [payment],
  periodStart: '2026-11-05',
  periodEnd: '2026-12-04',
  dueOn: '2026-11-05',
  netRentCents: 10_730,
  vatRateBasisPoints: 2_550,
  vatCents: 2_736,
  totalCents: 13_466,
  issuedAt: '2026-11-06T00:00:00.000Z',
  paidAt: null,
};

function request(body?: unknown): Request {
  return new Request('http://localhost/api/contracts/contract-1/invoices/invoice-1/payments', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const context = {
  params: Promise.resolve({ id: 'contract-1', invoiceId: 'invoice-1' }),
};

afterEach(() => {
  listInvoicePaymentsMock.mockReset();
  recordPaymentMock.mockReset();
});

describe('/api/contracts/:id/invoices/:invoiceId/payments', () => {
  it('records a payment in the standard success envelope', async () => {
    recordPaymentMock.mockResolvedValue({
      ok: true,
      payment,
      invoice,
    } satisfies PaymentRecordingResult);

    const response = await POST(
      request({ amountCents: 5_000, paidOn: '2026-11-05', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { contractId: 'contract-1', invoiceId: 'invoice-1', payment, invoice },
    });
    expect(recordPaymentMock).toHaveBeenCalledWith({} as never, {
      amountCents: 5_000,
      paidOn: '2026-11-05',
      actor: 'team-test',
      contractId: 'contract-1',
      invoiceId: 'invoice-1',
    });
  });

  it('lists the invoice payment history', async () => {
    listInvoicePaymentsMock.mockResolvedValue({
      ok: true,
      invoice,
    } satisfies InvoicePaymentsResult);

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { contractId: 'contract-1', invoiceId: 'invoice-1', invoice },
    });
    expect(listInvoicePaymentsMock).toHaveBeenCalledWith(
      {},
      {
        contractId: 'contract-1',
        invoiceId: 'invoice-1',
      }
    );
  });

  it('returns validation errors without recording a payment', async () => {
    const response = await POST(
      request({ amountCents: 0, paidOn: '2026-11-05', actor: 'team-test' }),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(recordPaymentMock).not.toHaveBeenCalled();
  });

  it('maps overpayment and missing invoices to stable errors', async () => {
    recordPaymentMock.mockResolvedValue({
      ok: false,
      reason: 'payment_exceeds_balance',
      remainingCents: 8_466,
    } satisfies PaymentRecordingResult);
    const overpaymentResponse = await POST(
      request({ amountCents: 9_000, paidOn: '2026-11-05', actor: 'team-test' }),
      context
    );
    expect(overpaymentResponse.status).toBe(422);
    expect(await overpaymentResponse.json()).toMatchObject({
      success: false,
      error: { code: 'PAYMENT_EXCEEDS_BALANCE', details: { remainingCents: 8_466 } },
    });

    listInvoicePaymentsMock.mockResolvedValue({
      ok: false,
      reason: 'invoice_not_found',
    } satisfies InvoicePaymentsResult);
    const missingResponse = await GET(request(), context);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toMatchObject({
      success: false,
      error: { code: 'PAYMENT_INVOICE_NOT_FOUND' },
    });
  });
});
