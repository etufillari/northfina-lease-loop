import { createOperatorSession } from '@/server/circular/operator-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ customer: vi.fn(), lease: vi.fn() }));
vi.mock('@/server/active-user', () => ({ getActiveUser: mocks.customer }));
vi.mock('@/server/db', () => ({ db: { engineLease: { findUnique: mocks.lease } } }));
import { demoCustomer, demoLeasePrincipal } from './demo-access';
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LEASE_LOOP_OPERATOR_PASSWORD', 'test-operator-password');
  mocks.customer.mockResolvedValue({ id: 'cust-aino' });
  mocks.lease.mockResolvedValue({ customerId: 'cust-aino' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const post = (origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/leases/x/invoices', {
    method: 'POST',
    headers: { origin },
  });
describe('development-only engine controls', () => {
  it('is unavailable in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(demoCustomer(post())).rejects.toMatchObject({ status: 404 });
    expect(mocks.customer).not.toHaveBeenCalled();
  });
  it('rejects cross-origin mutation and absent customer', async () => {
    await expect(demoCustomer(post('https://untrusted.test'))).rejects.toMatchObject({
      status: 403,
    });
    mocks.customer.mockResolvedValue(null);
    await expect(demoCustomer(post())).rejects.toMatchObject({ status: 401 });
  });
  it('accepts the browser host when Next normalizes the internal URL', async () => {
    const request = new Request('http://localhost:3010/api/leases/x/invoices', {
      method: 'POST',
      headers: { host: '127.0.0.1:3010', origin: 'http://127.0.0.1:3010' },
    });
    expect(await demoCustomer(request)).toMatchObject({ id: 'cust-aino' });
  });
  it('requires operator sign-in for issuing and scopes customer reads to owned leases', async () => {
    await expect(demoLeasePrincipal(post(), 'lease', true)).rejects.toMatchObject({ status: 403 });
    const request = post();
    request.headers.set(
      'cookie',
      `lease-loop-company-mode=1; lease-loop-operator=${createOperatorSession('test-operator-password')}`
    );
    expect(await demoLeasePrincipal(request, 'lease', true)).toEqual({
      actorId: 'demo:company-operator',
      role: 'operator',
    });
    expect(await demoLeasePrincipal(new Request('http://localhost:3000'), 'lease')).toMatchObject({
      role: 'customer',
      customerId: 'cust-aino',
    });
    mocks.lease.mockResolvedValue({ customerId: 'cust-other' });
    await expect(demoLeasePrincipal(post(), 'lease')).rejects.toMatchObject({ status: 403 });
    mocks.lease.mockResolvedValue(null);
    await expect(demoLeasePrincipal(post(), 'lease')).rejects.toMatchObject({ status: 404 });
  });
});
