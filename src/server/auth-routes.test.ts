import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { withAudit } from './audit';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('@/server/db', () => ({
  get db() {
    return fixture.db;
  },
}));

import { GET as me, POST as auth } from '@/app/api/auth/[operation]/route';
import { PATCH as changeStatus } from '@/app/api/assets/[id]/status/route';
import { GET as auditLog } from '@/app/api/audit-log/route';
import { GET as assets } from '@/app/api/assets/route';

const origin = 'http://localhost:3000';
const passphrase = ['automated', 'test', 'passphrase', 'only'].join('-');

beforeEach(async () => {
  fixture = await createTestDb();
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-secret-never-used-in-a-real-deployment');
  vi.stubEnv('NODE_ENV', 'test');
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});

function context(operation: string) {
  return { params: Promise.resolve({ operation }) };
}
function request(body: unknown = {}, cookie = '') {
  return new Request(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { origin, cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function register() {
  const response = await auth(
    request({ name: 'Customer', email: 'customer@example.com', password: passphrase }),
    context('register')
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

describe('authentication HTTP boundaries', () => {
  it('requires a session for me and does not expose unreviewed library operations', async () => {
    expect((await me(new Request(`${origin}/api/auth/me`), context('me'))).status).toBe(401);
    for (const operation of [
      'delete-user',
      'change-email',
      'sign-up',
      '__proto__',
      'constructor',
    ]) {
      expect((await auth(request(), context(operation))).status).toBe(404);
    }
    expect((await me(new Request(`${origin}/api/auth/session`), context('session'))).status).toBe(
      404
    );
  });

  it('returns only the current customer identity without credentials or tokens', async () => {
    const cookie = await register();
    const response = await me(
      new Request(`${origin}/api/auth/me?customerId=cust-aino`, { headers: { cookie } }),
      context('me')
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(result.data).sort()).toEqual(
      ['id', 'name', 'email', 'emailVerified', 'role', 'customerId'].sort()
    );
    expect(result.data.customerId).not.toBe('cust-aino');
  });

  it('keeps the catalogue public but protects global audit history and inventory changes', async () => {
    expect((await assets(new Request(`${origin}/api/assets`), undefined)).status).toBe(200);
    expect((await auditLog(new Request(`${origin}/api/audit-log`), undefined)).status).toBe(401);
    const cookie = await register();
    expect(
      (await auditLog(new Request(`${origin}/api/audit-log`, { headers: { cookie } }), undefined))
        .status
    ).toBe(403);
    const response = await changeStatus(request({ status: 'reserved' }, cookie), {
      params: Promise.resolve({ id: 'asset-1' }),
    });
    expect(response.status).toBe(403);
  });

  it('takes the inventory audit actor from the staff session and rejects forged actors', async () => {
    const cookie = await register();
    const user = await fixture.db.user.findFirstOrThrow();
    await withAudit(
      fixture.db,
      {
        actor: 'trusted-test-provisioner',
        action: 'test.provision',
        entityType: 'user',
        entityId: user.id,
      },
      async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { role: 'staff' } });
        await tx.asset.create({
          data: {
            id: 'asset-1',
            category: 'laptop',
            make: 'Test',
            model: 'Test',
            model_year: 2026,
            serial_number: 'test-serial',
            condition: 'new',
            usage_unit: 'battery_cycles',
            usage_value: 0,
            previous_lives: 0,
            status: 'available',
          },
        });
      }
    );
    const routeContext = { params: Promise.resolve({ id: 'asset-1' }) };
    expect(
      (await changeStatus(request({ status: 'reserved', actor: 'forged' }, cookie), routeContext))
        .status
    ).toBe(400);
    expect((await changeStatus(request({ status: 'reserved' }, cookie), routeContext)).status).toBe(
      200
    );
    const log = await fixture.db.auditLog.findFirstOrThrow({
      where: { action: 'asset.status_changed' },
    });
    expect(log.actor).toBe(user.id);
    expect(
      (await auditLog(new Request(`${origin}/api/audit-log`, { headers: { cookie } }), undefined))
        .status
    ).toBe(200);
    expect(
      (
        await changeStatus(request({ status: 'reserved' }, cookie), {
          params: Promise.resolve({ id: 'missing' }),
        })
      ).status
    ).toBe(404);
  });

  it('returns validation errors through the standard envelope', async () => {
    const invalid = new Request(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{',
    });
    const response = await auth(invalid, context('login'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_JSON' },
    });
    expect((await auth(request({ name: 'Name' }), context('register'))).status).toBe(400);
  });
});
