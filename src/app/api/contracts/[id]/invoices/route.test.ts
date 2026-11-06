import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceGenerationResult, InvoiceListResult, InvoiceRecord } from '@/server/invoices';

const { generateInvoicesMock, listInvoicesMock } = vi.hoisted(() => ({
  generateInvoicesMock: vi.fn(),
  listInvoicesMock: vi.fn(),
}));

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/invoices', async () => {
  const { z } = await import('zod');
  return {
    generateInvoices: generateInvoicesMock,
    listInvoices: listInvoicesMock,
    invoiceGenerationRequestSchema: z.strictObject({
      actor: z.string().trim().min(1).max(100),
    }),
  };
});

import { GET, POST } from './route';

const invoice: InvoiceRecord = {
  id: 'invoice-1',
  contractId: 'contract-1',
  sequence: 1,
  status: 'issued',
  paymentStatus: 'unpaid',
  totalPaidCents: 0,
  remainingCents: 13_466,
  isOverdue: false,
  payments: [],
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
  return new Request('http://localhost/api/contracts/contract-1/invoices', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const context = { params: Promise.resolve({ id: 'contract-1' }) };

afterEach(() => {
  generateInvoicesMock.mockReset();
  listInvoicesMock.mockReset();
});

describe('/api/contracts/:id/invoices', () => {
  it('creates the schedule in the standard success envelope', async () => {
    generateInvoicesMock.mockResolvedValue({
      ok: true,
      created: true,
      invoices: [invoice],
    } satisfies InvoiceGenerationResult);

    const response = await POST(request({ actor: 'team-test' }), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { contractId: 'contract-1', invoices: [invoice] },
    });
    expect(generateInvoicesMock).toHaveBeenCalledWith({} as never, {
      contractId: 'contract-1',
      actor: 'team-test',
    });
  });

  it('returns 200 when generation is an idempotent retry', async () => {
    generateInvoicesMock.mockResolvedValue({
      ok: true,
      created: false,
      invoices: [invoice],
    } satisfies InvoiceGenerationResult);

    const response = await POST(request({ actor: 'team-test' }), context);

    expect(response.status).toBe(200);
  });

  it('lists the persisted schedule', async () => {
    listInvoicesMock.mockResolvedValue({
      ok: true,
      invoices: [invoice],
    } satisfies InvoiceListResult);

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { contractId: 'contract-1', invoices: [invoice] },
    });
    expect(listInvoicesMock).toHaveBeenCalledWith({}, 'contract-1');
  });

  it('returns validation errors without generating invoices', async () => {
    const response = await POST(request({ actor: '' }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(generateInvoicesMock).not.toHaveBeenCalled();
  });

  it('maps inactive contracts and missing schedules to stable errors', async () => {
    generateInvoicesMock.mockResolvedValue({
      ok: false,
      reason: 'contract_not_active',
      status: 'completed',
    } satisfies InvoiceGenerationResult);
    const inactiveResponse = await POST(request({ actor: 'team-test' }), context);
    expect(inactiveResponse.status).toBe(422);
    expect(await inactiveResponse.json()).toMatchObject({
      success: false,
      error: { code: 'CONTRACT_NOT_ACTIVE', details: { status: 'completed' } },
    });

    listInvoicesMock.mockResolvedValue({
      ok: false,
      reason: 'invoice_schedule_not_generated',
    } satisfies InvoiceListResult);
    const missingResponse = await GET(request(), context);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toMatchObject({
      success: false,
      error: { code: 'INVOICE_SCHEDULE_NOT_GENERATED' },
    });
  });
});
