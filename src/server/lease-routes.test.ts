import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { toAssetRowData } from './assets';
import { withAudit } from './audit';
import { handleAuthMutation } from './auth-handler';
import { readIdentity } from './auth-session';
import { createDemoLease } from './demo-lease';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('@/server/db', () => ({
  get db() {
    return fixture.db;
  },
}));
import { GET as getLeases } from '@/app/api/leases/route';
import { GET as getLease } from '@/app/api/leases/[id]/route';
import { POST as requestChange } from '@/app/api/leases/[id]/requests/route';

const origin = 'http://localhost:3000';
const settings = {
  baseURL: origin,
  secret: 'test-only-secret-never-used-in-a-real-deployment',
  production: false,
};
const password = ['automated', 'test', 'passphrase', 'only'].join('-');
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  fixture = await createTestDb();
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', settings.secret);
  vi.stubEnv('NODE_ENV', 'test');
  const asset = (await loadAssets()).find((item) => item.id === 'ebike-005');
  if (!asset) throw new Error('Missing demo asset');
  await withAudit(
    fixture.db,
    { actor: 'test', action: 'test.setup', entityType: 'asset', entityId: asset.id },
    (tx) => tx.asset.create({ data: toAssetRowData(asset) })
  );
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});

async function customer(email: string) {
  const request = new Request(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ name: email, email, password }),
  });
  const result = await handleAuthMutation(fixture.db, request, 'register', settings);
  expect(result.status).toBe(200);
  const cookie = result.headers
    .getSetCookie()
    .map((item) => item.split(';')[0])
    .join('; ');
  const identity = await readIdentity(fixture.db, new Headers({ cookie }), settings);
  if (!identity) throw new Error('Registration did not create a session');
  return { cookie, identity };
}
function changeRequest(cookie: string, originHeader = origin) {
  return new Request(`${origin}/api/leases/any/requests`, {
    method: 'POST',
    headers: { origin: originHeader, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'return' }),
  });
}

describe('lease API boundaries', () => {
  it('requires a session and rejects cross-origin writes', async () => {
    expect((await getLeases(new Request(`${origin}/api/leases`), undefined)).status).toBe(401);
    const first = await customer('first@example.com');
    expect(
      (
        await requestChange(
          changeRequest(first.cookie, 'https://elsewhere.example'),
          context('any')
        )
      ).status
    ).toBe(403);
  });
  it('does not reveal or allow changes to another customer lease', async () => {
    const first = await customer('first@example.com');
    const second = await customer('second@example.com');
    const id = await createDemoLease(fixture.db, {
      customerId: first.identity.customerId,
      userId: first.identity.id,
      today: '2026-11-05',
    });
    const other = new Request(`${origin}/api/leases/${id}`, { headers: { cookie: second.cookie } });
    expect((await getLease(other, context(id))).status).toBe(404);
    expect((await requestChange(changeRequest(second.cookie), context(id))).status).toBe(404);
    expect((await requestChange(changeRequest(first.cookie), context(id))).status).toBe(201);
    expect(await fixture.db.leaseRequest.count()).toBe(1);
  });
});
