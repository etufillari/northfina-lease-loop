import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { withAudit } from './audit';
import type { AuthSettings } from './auth-config';
import { handleAuthMutation } from './auth-handler';
import type { AuthOperation } from './auth-input';
import { readIdentity, requireIdentity, requireStaff } from './auth-session';

const settings: AuthSettings = {
  baseURL: 'http://localhost:3000',
  secret: 'test-only-secret-never-used-in-a-real-deployment',
  production: false,
};
const passphrase = ['only', 'for', 'automated', 'tests'].join('-');
let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
});
afterEach(async () => {
  await fixture.cleanup();
});

function request(body: unknown, cookie = '', extra: Record<string, string> = {}) {
  return new Request(`${settings.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { origin: settings.baseURL, 'content-type': 'application/json', cookie, ...extra },
    body: JSON.stringify(body),
  });
}

function mutate(operation: AuthOperation, body: unknown = {}, cookie = '') {
  return handleAuthMutation(fixture.db, request(body, cookie), operation, settings);
}

function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function register(email = 'first@example.com') {
  const response = await mutate('register', {
    name: 'First Customer',
    email,
    password: passphrase,
  });
  expect(await response.clone().json()).toMatchObject({ success: true });
  return cookieOf(response);
}

async function changeSession(data: { expiresAt?: Date; userId?: string }) {
  return withAudit(
    fixture.db,
    {
      actor: 'test',
      action: 'test.session_changed',
      entityType: 'session',
      entityId: 'test',
    },
    (tx) => tx.authSession.updateMany({ data })
  );
}

describe('audited authentication', () => {
  it('creates a private customer, hashes credentials, sets protected cookies and returns no token', async () => {
    const response = await mutate('register', {
      name: 'First Customer',
      email: 'FIRST@EXAMPLE.COM',
      password: passphrase,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { completed: true } });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const user = await fixture.db.user.findUniqueOrThrow({ where: { email: 'first@example.com' } });
    expect(user.role).toBe('customer');
    expect(user.emailVerified).toBe(false);
    expect(await fixture.db.customer.count({ where: { ownerUserId: user.id } })).toBe(1);
    const credential = await fixture.db.authIdentity.findFirstOrThrow();
    expect(credential.password).not.toBe(passphrase);
    expect(credential.password?.length).toBeGreaterThan(64);
    const log = await fixture.db.auditLog.findFirstOrThrow();
    expect(log.actor).toBe(user.id);
    expect(log.details_json).not.toContain(passphrase);
    expect(log.details_json).not.toContain((await fixture.db.authSession.findFirstOrThrow()).token);
  });

  it('logs in using normalized email and rejects an incorrect password with a generic error', async () => {
    await register();
    const denied = await mutate('login', { email: 'missing@example.com', password: passphrase });
    const wrong = await mutate('login', { email: 'first@example.com', password: 'wrong' });
    expect(denied.status).toBe(401);
    expect((await denied.json()).error).toEqual((await wrong.json()).error);
    const result = await mutate('login', { email: 'FIRST@EXAMPLE.COM', password: passphrase });
    expect(result.status).toBe(200);
    expect(
      await readIdentity(fixture.db, new Headers({ cookie: cookieOf(result) }), settings)
    ).not.toBeNull();
  });

  it('does not let a registrant select a role, customer id or actor', async () => {
    for (const extra of [{ role: 'staff' }, { customerId: 'cust-aino' }, { actor: 'someone' }]) {
      await expect(
        mutate('register', {
          name: 'Attacker',
          email: 'attacker@example.com',
          password: passphrase,
          ...extra,
        })
      ).rejects.toThrow();
    }
    expect(await fixture.db.user.count()).toBe(0);
  });

  it('rejects cross-origin, missing-origin and non-JSON mutations before any writes', async () => {
    for (const extra of [
      { origin: 'https://evil.example' },
      { origin: '' },
      { 'sec-fetch-site': 'cross-site' },
      { 'content-type': 'text/plain' },
    ] as Record<string, string>[]) {
      await expect(
        handleAuthMutation(fixture.db, request({}, '', extra), 'logout', settings)
      ).rejects.toThrow();
    }
    expect(await fixture.db.auditLog.count()).toBe(0);
  });

  it('rejects short passwords and duplicate registrations without creating another customer', async () => {
    await expect(
      mutate('register', { name: 'Name', email: 'first@example.com', password: 'short' })
    ).rejects.toThrow();
    await register();
    const result = await mutate('register', {
      name: 'Other',
      email: 'first@example.com',
      password: passphrase,
    });
    expect(result.status).toBe(400);
    expect(await fixture.db.user.count()).toBe(1);
    expect(await fixture.db.customer.count()).toBe(1);
  });

  it('rejects oversized bodies whether or not Content-Length is supplied', async () => {
    for (const headers of [{}, { 'content-length': '99999' }] as Record<string, string>[]) {
      await expect(
        handleAuthMutation(
          fixture.db,
          request({ name: 'x'.repeat(9000) }, '', headers),
          'register',
          settings
        )
      ).rejects.toMatchObject({ status: 413 });
    }
    expect(await fixture.db.user.count()).toBe(0);
  });

  it('uses Secure cookies for an HTTPS production origin', async () => {
    const production = { ...settings, baseURL: 'https://example.com', production: true };
    const response = await handleAuthMutation(
      fixture.db,
      request({ name: 'Name', email: 'first@example.com', password: passphrase }, '', {
        origin: production.baseURL,
      }),
      'register',
      production
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.get('set-cookie')).toContain('__Secure-');
  });

  it('invalidates the server session on logout even when the old cookie is reused', async () => {
    const cookie = await register();
    expect((await mutate('logout', {}, cookie)).status).toBe(200);
    expect(await readIdentity(fixture.db, new Headers({ cookie }), settings)).toBeNull();
    expect(await fixture.db.authSession.count()).toBe(0);
  });

  it('refuses expired and tampered sessions without mutating the database on reads', async () => {
    const cookie = await register();
    await changeSession({ expiresAt: new Date('2000-01-01') });
    expect(await readIdentity(fixture.db, new Headers({ cookie }), settings)).toBeNull();
    expect(await fixture.db.authSession.count()).toBe(1);
    expect(
      await readIdentity(fixture.db, new Headers({ cookie: `${cookie}tampered` }), settings)
    ).toBeNull();
    await expect(requireIdentity(fixture.db, new Headers(), settings)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('isolates customer ownership and rejects ordinary users from staff access', async () => {
    const first = await register();
    const second = await register('second@example.com');
    const a = await readIdentity(fixture.db, new Headers({ cookie: first }), settings);
    const b = await readIdentity(fixture.db, new Headers({ cookie: second }), settings);
    expect(a?.customerId).not.toBe(b?.customerId);
    await expect(
      requireStaff(fixture.db, new Headers({ cookie: first }), settings)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requireIdentity(fixture.db, new Headers({ cookie: second }), settings)
    ).resolves.toMatchObject({ email: 'second@example.com' });
  });

  it('updates only the authenticated profile', async () => {
    const cookie = await register();
    await register('second@example.com');
    expect((await mutate('profile', { name: 'Updated Name' }, cookie)).status).toBe(200);
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { email: 'first@example.com' } })).name
    ).toBe('Updated Name');
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { email: 'second@example.com' } })).name
    ).toBe('First Customer');
    await expect(mutate('profile', { name: 'Name', role: 'staff' }, cookie)).rejects.toThrow();
    await expect(mutate('profile', { name: 'Name' })).rejects.toMatchObject({ status: 401 });
  });

  it('logs out all devices', async () => {
    const first = await register();
    const login = await mutate('login', { email: 'first@example.com', password: passphrase });
    const second = cookieOf(login);
    expect((await mutate('logout-all', {}, first)).status).toBe(200);
    for (const cookie of [first, second]) {
      expect(await readIdentity(fixture.db, new Headers({ cookie }), settings)).toBeNull();
    }
  });

  it('requires the current password and revokes other sessions after a password change', async () => {
    const first = await register();
    const second = cookieOf(
      await mutate('login', { email: 'first@example.com', password: passphrase })
    );
    const next = `${passphrase}-new`;
    expect(
      (await mutate('password', { currentPassword: 'wrong', newPassword: next }, first)).status
    ).toBe(400);
    const response = await mutate(
      'password',
      { currentPassword: passphrase, newPassword: next },
      first
    );
    expect(response.status).toBe(200);
    expect(await readIdentity(fixture.db, new Headers({ cookie: second }), settings)).toBeNull();
    expect(
      (await mutate('login', { email: 'first@example.com', password: passphrase })).status
    ).toBe(401);
    expect((await mutate('login', { email: 'first@example.com', password: next })).status).toBe(
      200
    );
  });

  it('enforces persistent login throttling even with spoofed forwarding headers', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await handleAuthMutation(
        fixture.db,
        request({ email: 'missing@example.com', password: passphrase }, '', {
          'x-forwarded-for': `192.0.2.${attempt}`,
        }),
        'login',
        settings
      );
      expect(response.status).toBe(401);
    }
    const limited = await mutate('login', { email: 'missing@example.com', password: passphrase });
    expect(limited.status).toBe(429);
    expect(limited.headers.has('retry-after')).toBe(true);
    expect(await fixture.db.authRateLimit.count()).toBeGreaterThan(0);
  });

  it('rolls back users, customers, credentials, sessions and rate counters when auditing fails', async () => {
    // Database-level fault injection demonstrates the real transaction boundary.
    await fixture.db.$executeRawUnsafe('DROP TABLE AuditLog');
    await expect(
      mutate('register', { name: 'Name', email: 'first@example.com', password: passphrase })
    ).rejects.toThrow();
    for (const count of [
      await fixture.db.user.count(),
      await fixture.db.customer.count(),
      await fixture.db.authIdentity.count(),
      await fixture.db.authSession.count(),
      await fixture.db.authRateLimit.count(),
    ]) {
      expect(count).toBe(0);
    }
  });
});
