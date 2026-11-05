import { cookies } from 'next/headers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCustomers, loadStaff } from '@/data/load';
import type { Customer, Staff } from '@/data/schemas';
import {
  actorForToken,
  getActor,
  requireActor,
  requireCustomer,
  requireRole,
  sessionSecret,
} from './actor';
import { SESSION_COOKIE_NAME, signSession } from './session';

// getActor/requireActor/requireRole read the real session cookie via next/headers, which
// only works inside a request Next.js is handling. Mocked here so the 401/403 branching -
// the actual permission gate every route will rely on - is still tested directly.
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
const mockedCookies = vi.mocked(cookies);

/** A fake cookie jar holding only the session cookie, or none if `token` is undefined. */
function cookieJarWith(token: string | undefined) {
  const entry = token === undefined ? undefined : { name: SESSION_COOKIE_NAME, value: token };
  return { get: (name: string) => (name === SESSION_COOKIE_NAME ? entry : undefined) };
}

// Tests run against the real data pack, so they also catch an id that stops existing.
let customers: Customer[];
let staff: Staff[];
beforeAll(async () => {
  [customers, staff] = await Promise.all([loadCustomers(), loadStaff()]);
});

const secret = 'test-secret-at-least-this-long';
const now = new Date('2026-11-05T12:00:00.000Z');

describe('actorForToken', () => {
  it('returns null when there is no token', async () => {
    expect(await actorForToken(undefined, secret, now)).toBeNull();
  });

  it('finds the customer behind a token signed for them', async () => {
    const aino = customers.find((customer) => customer.id === 'cust-aino');
    if (!aino) throw new Error('expected cust-aino in the data pack');

    const token = await signSession({ sub: aino.id, role: 'client' }, secret, now);
    expect(await actorForToken(token, secret, now)).toEqual({
      kind: 'customer',
      role: 'client',
      customer: aino,
    });
  });

  it('finds the staff member behind a token signed for them', async () => {
    const dealer = staff.find((person) => person.id === 'staff-dealer');
    if (!dealer) throw new Error('expected staff-dealer in the data pack');

    const token = await signSession({ sub: dealer.id, role: 'dealer' }, secret, now);
    expect(await actorForToken(token, secret, now)).toEqual({
      kind: 'staff',
      role: 'dealer',
      staff: dealer,
    });
  });

  it('returns null for a token whose subject matches nobody', async () => {
    const token = await signSession({ sub: 'cust-does-not-exist', role: 'client' }, secret, now);
    expect(await actorForToken(token, secret, now)).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const token = await signSession({ sub: 'cust-aino', role: 'client' }, secret, now);
    expect(await actorForToken(token, 'a-totally-different-secret', now)).toBeNull();
  });

  it('returns null once the token has expired', async () => {
    const token = await signSession({ sub: 'cust-aino', role: 'client' }, secret, now);
    const thirteenHoursLater = new Date(now.getTime() + 13 * 60 * 60 * 1000);
    expect(await actorForToken(token, secret, thirteenHoursLater)).toBeNull();
  });
});

describe('sessionSecret', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns JWT_SECRET from the environment', () => {
    vi.stubEnv('JWT_SECRET', secret);
    expect(sessionSecret()).toBe(secret);
  });

  it('throws when JWT_SECRET is not set', () => {
    vi.stubEnv('JWT_SECRET', '');
    expect(() => sessionSecret()).toThrow(/JWT_SECRET/);
  });
});

describe('getActor, requireActor and requireRole', () => {
  beforeEach(() => vi.stubEnv('JWT_SECRET', secret));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('getActor returns null when there is no session cookie', async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    expect(await getActor()).toBeNull();
  });

  it('getActor returns the identity for a valid cookie', async () => {
    const token = await signSession({ sub: 'cust-aino', role: 'client' }, secret);
    mockedCookies.mockResolvedValue(cookieJarWith(token) as never);
    expect(await getActor()).toMatchObject({ kind: 'customer', role: 'client' });
  });

  it('requireActor throws 401 when nobody is logged in', async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    await expect(requireActor()).rejects.toMatchObject({ status: 401, code: 'NOT_LOGGED_IN' });
  });

  it('requireRole throws 403 when the role does not have the permission', async () => {
    const token = await signSession({ sub: 'cust-aino', role: 'client' }, secret);
    mockedCookies.mockResolvedValue(cookieJarWith(token) as never);
    await expect(requireRole('asset.change_status')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('requireRole resolves with the actor when the role has the permission', async () => {
    const token = await signSession({ sub: 'staff-dealer', role: 'dealer' }, secret);
    mockedCookies.mockResolvedValue(cookieJarWith(token) as never);
    const actor = await requireRole('asset.change_status');
    expect(actor).toMatchObject({ kind: 'staff', role: 'dealer' });
  });

  it('requireCustomer resolves with the customer record for a client', async () => {
    const token = await signSession({ sub: 'cust-aino', role: 'client' }, secret);
    mockedCookies.mockResolvedValue(cookieJarWith(token) as never);
    expect(await requireCustomer('application.submit')).toMatchObject({
      id: 'cust-aino',
      type: 'consumer',
    });
  });

  it('requireCustomer keeps the 401 and 403 of requireRole', async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    await expect(requireCustomer('application.submit')).rejects.toMatchObject({ status: 401 });

    const token = await signSession({ sub: 'staff-dealer', role: 'dealer' }, secret);
    mockedCookies.mockResolvedValue(cookieJarWith(token) as never);
    await expect(requireCustomer('application.submit')).rejects.toMatchObject({ status: 403 });
  });

  it('requireCustomer refuses staff even for a permission that staff hold', async () => {
    const token = await signSession({ sub: 'staff-dealer', role: 'dealer' }, secret);
    mockedCookies.mockResolvedValue(cookieJarWith(token) as never);
    await expect(requireCustomer('asset.change_status')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
