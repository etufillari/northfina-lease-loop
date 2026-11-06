// Who is signed in, and the route guards built on it. The browser can no longer say who it
// is: identity comes from `currentUser()` (the demo persona, read on the server), and an
// `actor` or `customerId` in a request body is refused, not trusted.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import { seedWaitlist } from './waitlist';

// The request's cookie jar and the app's database, both stood in for here.
const jar: { persona?: string } = {};
const holder: { db?: Awaited<ReturnType<typeof createTestDb>>['db'] } = {};
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'persona' && jar.persona ? { name, value: jar.persona } : undefined,
  }),
}));
vi.mock('./db', () => ({
  get db() {
    return holder.db;
  },
}));

const { currentUser, requireCustomer, requireStaff, requireUser } = await import('./current-user');

let cleanup: () => Promise<void>;
beforeAll(async () => {
  const test = await createTestDb();
  holder.db = test.db;
  cleanup = test.cleanup;
  await seedAssets(test.db, await loadAssets());
  await seedCustomers(test.db, await loadCustomers());
  await seedWaitlist(test.db, await loadSecondLifeDemand());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(() => {
  delete jar.persona;
});

const status = async (value: unknown) => (value instanceof Response ? value.status : 'user');

describe('currentUser', () => {
  it('is nobody without a persona, or with one that is not a customer', async () => {
    expect(await currentUser()).toBeNull();
    jar.persona = 'cust-nobody';
    expect(await currentUser()).toBeNull();
  });

  it('a customer is themself, not staff', async () => {
    jar.persona = 'cust-aino';
    expect(await currentUser()).toEqual({
      actorId: 'cust-aino',
      customerId: 'cust-aino',
      isStaff: false,
      name: 'Aino Virtanen',
    });
  });

  it('staff are flagged as staff and are no customer', async () => {
    jar.persona = 'staff';
    expect(await currentUser()).toEqual({
      actorId: 'staff',
      customerId: null,
      isStaff: true,
      name: null,
    });
  });
});

describe('without demo mode', () => {
  it('nobody is signed in: the persona picker is a demo stand-in for a login', async () => {
    jar.persona = 'cust-aino';
    process.env.DEMO_MODE = 'off';
    try {
      expect(await currentUser()).toBeNull();
      expect(await status(await requireUser())).toBe(401);
    } finally {
      delete process.env.DEMO_MODE;
    }
  });
});

describe('the guards', () => {
  it('nobody signed in gets 401 everywhere', async () => {
    expect(await status(await requireUser())).toBe(401);
    expect(await status(await requireCustomer())).toBe(401);
    expect(await status(await requireStaff())).toBe(401);
  });

  it('a customer passes the customer guard but not the staff one', async () => {
    jar.persona = 'cust-aino';
    expect(await status(await requireCustomer())).toBe('user');
    expect(await status(await requireStaff())).toBe(403);
  });

  it('staff pass the staff guard but are not a customer', async () => {
    jar.persona = 'staff';
    expect(await status(await requireStaff())).toBe('user');
    expect(await status(await requireCustomer())).toBe(403);
  });
});

describe('routes take identity from the signed-in user, never from the body', () => {
  const post = (url: string, body: unknown) =>
    new Request(`http://test${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('an actor in the body is refused, not believed', async () => {
    const { POST } = await import('@/app/api/staff/applications/[id]/approve/route');
    jar.persona = 'cust-aino';
    const response = await POST(post('/api/staff/applications/x/approve', { actor: 'staff' }), {
      params: Promise.resolve({ id: 'x' }),
    });
    // A customer cannot reach a staff route, whatever the body claims.
    expect(response.status).toBe(403);
  });

  it('a customer cannot submit someone else’s application', async () => {
    const state = await applyAndSubmit(holder.db!, {
      customerId: 'cust-aino',
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      script: ainoScript,
      asOf: '2026-11-05',
    });
    const { POST } = await import('@/app/api/applications/[id]/sign/route');
    jar.persona = 'cust-lena';
    const response = await POST(
      post(`/api/applications/${state.application.id}/sign?asOf=2026-11-05`, {
        startDate: '2026-11-05',
      }),
      { params: Promise.resolve({ id: state.application.id }) }
    );
    expect(response.status).toBe(403);
    // Aino herself can.
    jar.persona = 'cust-aino';
    const own = await POST(
      post(`/api/applications/${state.application.id}/sign?asOf=2026-11-05`, {
        startDate: '2026-11-05',
      }),
      { params: Promise.resolve({ id: state.application.id }) }
    );
    expect(own.status).toBe(201);
  });
});
