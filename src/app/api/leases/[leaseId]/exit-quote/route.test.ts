import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/server/api-response';
const mocks = vi.hoisted(() => ({ principal: vi.fn(), preview: vi.fn() }));
vi.mock('@/server/lease-engine/demo-access', () => ({ demoLeasePrincipal: mocks.principal }));
vi.mock('@/server/circular/exit-quote', () => ({ previewEarlyExit: mocks.preview }));
vi.mock('@/server/db', () => ({ db: {} }));
import { GET } from './route';
afterEach(() => vi.resetAllMocks());
const context = { params: Promise.resolve({ leaseId: 'lease' }) };
describe('customer exit preview', () => {
  it('authorizes ownership before reading a quote', async () => {
    mocks.principal.mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Lease belongs to another customer')
    );
    const response = await GET(
      new Request('http://localhost/api/leases/lease/exit-quote?elapsedMonths=6'),
      context
    );
    expect(response.status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('validates whole completed months', async () => {
    mocks.principal.mockResolvedValue({ role: 'customer' });
    const response = await GET(
      new Request('http://localhost/api/leases/lease/exit-quote?elapsedMonths=1.5'),
      context
    );
    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('returns a read-only quote for the authorized lease', async () => {
    mocks.principal.mockResolvedValue({ role: 'customer' });
    mocks.preview.mockResolvedValue({ feeNetCents: 58350 });
    const response = await GET(
      new Request('http://localhost/api/leases/lease/exit-quote?elapsedMonths=6'),
      context
    );
    expect(await response.json()).toMatchObject({ success: true, data: { feeNetCents: 58350 } });
    expect(mocks.preview).toHaveBeenCalledWith({}, 'lease', 6);
  });
});
