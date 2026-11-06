import { describe, expect, it, vi, afterEach } from 'vitest';
import { ApiError } from '@/server/api-response';
const mocks = vi.hoisted(() => ({ principal: vi.fn(), get: vi.fn(), complete: vi.fn() }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lease-engine/demo-access', () => ({ demoLeasePrincipal: mocks.principal }));
vi.mock('@/server/lease-engine/leases', () => ({
  getLease: mocks.get,
  completeLease: mocks.complete,
}));
import { POST } from './route';
afterEach(() => vi.resetAllMocks());
const context = { params: Promise.resolve({ leaseId: 'lease' }) };
describe('customer-owned development completion', () => {
  it('uses customer ownership checks and completes only at the agreed end', async () => {
    mocks.principal.mockResolvedValue({ actorId: 'cust-aino', role: 'customer' });
    mocks.get.mockResolvedValue({ startDate: '2026-01-31', termMonths: 36 });
    mocks.complete.mockResolvedValue({ status: 'COMPLETED' });
    const response = await POST(
      new Request('http://localhost/api/leases/lease/demo-complete', { method: 'POST' }),
      context
    );
    expect(response.status).toBe(200);
    expect(mocks.principal.mock.calls[0]).toHaveLength(2);
    expect(mocks.complete).toHaveBeenCalledWith(
      {},
      { actor: 'cust-aino', idempotencyKey: 'complete:lease' },
      'lease',
      '2029-01-31',
      1
    );
  });
  it.each([403, 404])(
    'does not simulate when ownership or development access rejects with %s',
    async (status) => {
      mocks.principal.mockRejectedValue(new ApiError(status, 'FORBIDDEN', 'Not allowed'));
      const response = await POST(
        new Request('http://localhost/api/leases/lease/demo-complete', { method: 'POST' }),
        context
      );
      expect(response.status).toBe(status);
      expect(mocks.complete).not.toHaveBeenCalled();
    }
  );
});
