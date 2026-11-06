import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/server/api-response';
const mocks = vi.hoisted(() => ({ customer: vi.fn(), invoice: vi.fn() }));
vi.mock('@/server/lease-engine/demo-access', () => ({ demoCustomer: mocks.customer }));
vi.mock('@/server/db', () => ({ db: { engineInvoice: { findFirst: mocks.invoice } } }));
import { GET } from './route';
afterEach(() => vi.resetAllMocks());
const request = () => new Request('http://localhost/api/invoices/invoice-1?format=pdf');
const context = { params: Promise.resolve({ invoiceId: 'invoice-1' }) };
describe('owned invoice PDF', () => {
  it('downloads a saved invoice and scopes the query to the current customer', async () => {
    mocks.customer.mockResolvedValue({ id: 'cust-aino' });
    mocks.invoice.mockResolvedValue({
      id: 'invoice-1',
      number: 'INV-2026-0001',
      leaseId: 'lease-1',
      periodIndex: 1,
      issueDate: '2026-11-06',
      dueDate: '2026-11-20',
      endDateExclusive: '2026-12-06',
      netCents: 10000,
      vatCents: 2550,
      grossCents: 12550,
      taxJson: JSON.stringify({
        rateBps: 2550,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        fictional: false,
      }),
      status: 'ISSUED',
      issuedAt: new Date('2026-11-06T12:00:00Z'),
    });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.invoice).toHaveBeenCalledWith({
      where: { id: 'invoice-1', lease: { customerId: 'cust-aino' } },
    });
    const pdf = await response.text();
    expect(pdf).toMatch(/^%PDF-1.4/);
    expect(pdf).toContain('Invoice INV-2026-0001');
    expect(pdf).toContain('Total: EUR 125.50');
  });
  it('returns a safe envelope for missing or unowned invoices', async () => {
    mocks.customer.mockResolvedValue({ id: 'cust-other' });
    mocks.invoice.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
  it('does not query invoices without a customer session', async () => {
    mocks.customer.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Select a customer'));
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(mocks.invoice).not.toHaveBeenCalled();
  });
});
