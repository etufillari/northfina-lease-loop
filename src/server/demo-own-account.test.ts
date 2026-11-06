import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';

let fixture: Awaited<ReturnType<typeof createTestDb>>;
vi.mock('@/server/db', () => ({
  get db() {
    return fixture.db;
  },
}));

import { GET as authGet } from '@/app/api/auth/[operation]/route';
import { POST as postPersona } from '@/app/api/demo/persona/route';
import { authSettings, createAuth } from './auth-config';
import { CURRENT_USER_ID, OWN_SESSION_COOKIE, isPersonaAccount } from './demo-own-account';

const origin = 'http://localhost:3000';

beforeEach(async () => {
  fixture = await createTestDb();
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-secret-never-used-in-a-real-deployment');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('LEASE_LOOP_DEMO', '');
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});

/** Cookie jar: later Set-Cookie headers replace or (Max-Age=0) remove earlier values. */
function jar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    header: () => [...values].map(([name, value]) => `${name}=${value}`).join('; '),
    take(response: Response) {
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';');
        const [name, value = ''] = pair!.split(/=(.*)/s);
        if (/max-age=0/i.test(cookie)) values.delete(name!);
        else values.set(name!, value);
      }
      return response;
    },
    get: (name: string) => values.get(name),
  };
}

async function signUpOwnAccount() {
  const auth = createAuth(fixture.db, authSettings());
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Tiisetso',
        email: 'me@example.com',
        password: 'a-long-enough-password-1',
      }),
    })
  );
  const { user } = (await response.clone().json()) as { user: { id: string } };
  await fixture.db.customer.create({ data: { id: 'my-customer', ownerUserId: user.id } });
  const cookies = jar();
  cookies.take(response);
  return cookies;
}

const switchTo = (cookies: ReturnType<typeof jar>, personaId: string) =>
  postPersona(
    new Request(`${origin}/api/demo/persona`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', cookie: cookies.header() },
      body: JSON.stringify({ personaId }),
    }),
    undefined
  ).then(cookies.take);

async function whoAmI(cookies: ReturnType<typeof jar>) {
  const response = await authGet(
    new Request(`${origin}/api/auth/me`, { headers: { cookie: cookies.header() } }),
    { params: Promise.resolve({ operation: 'me' }) }
  );
  return (await response.json()).data?.email ?? null;
}

describe('demo "Current user"', () => {
  it('returns from personas to the account the browser was signed in with', async () => {
    const cookies = await signUpOwnAccount();
    expect(await whoAmI(cookies)).toBe('me@example.com');
    const own = cookies.get('lease-loop.session_token');

    // Act as Aino, then Mikko: the own session is kept once and not replaced by a persona's.
    expect((await switchTo(cookies, 'cust-aino')).status).toBe(200);
    expect(cookies.get(OWN_SESSION_COOKIE)).toBe(own);
    expect(await whoAmI(cookies)).not.toBe('me@example.com');
    await switchTo(cookies, 'cust-mikko');
    expect(cookies.get(OWN_SESSION_COOKIE)).toBe(own);

    const back = await switchTo(cookies, CURRENT_USER_ID);
    expect(back.status).toBe(200);
    expect((await back.json()).data).toEqual({
      personaId: CURRENT_USER_ID,
      staff: false,
      cart: [],
    });
    expect(await whoAmI(cookies)).toBe('me@example.com');
    expect(cookies.get(OWN_SESSION_COOKIE)).toBeUndefined();
    const audit = await fixture.db.auditLog.findFirst({
      where: { action: 'demo.persona_switched', entity_id: 'my-customer' },
    });
    expect(JSON.parse(audit!.details_json!)).toEqual({ personaId: CURRENT_USER_ID });
  });

  it('refuses "Current user" when no own account was kept', async () => {
    const cookies = jar();
    await switchTo(cookies, 'cust-aino');
    expect(cookies.get(OWN_SESSION_COOKIE)).toBeUndefined();
    const response = await switchTo(cookies, CURRENT_USER_ID);
    expect(response.status).toBe(404);
    expect(await whoAmI(cookies)).not.toBeNull();
  });

  it('recognises persona accounts, including demo staff', () => {
    const personas = [
      { id: 'cust-aino', staff: false },
      { id: 'demo-staff', staff: true },
    ];
    expect(isPersonaAccount('cust-aino', personas)).toBe(true);
    expect(isPersonaAccount('demo-staff-customer', personas)).toBe(true);
    expect(isPersonaAccount('my-customer', personas)).toBe(false);
  });
});
