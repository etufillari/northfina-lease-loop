// Runs the real handlers against a real, migrated SQLite database, only swapping which one.
import { cookies } from 'next/headers';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/server/prisma-client';
import { SESSION_COOKIE_NAME, signSession } from '@/server/session';
import { todayIso } from '@/server/today';
import { createTestDb } from '../../../../tests/helpers/test-db';
import { GET, PUT } from './route';

const testDb = vi.hoisted(() => ({ current: undefined as PrismaClient | undefined }));
vi.mock('@/server/db', () => ({
  get db() {
    return testDb.current;
  },
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const secret = 'test-secret-at-least-this-long';
let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', secret);
  ({ db, cleanup } = await createTestDb());
  testDb.current = db;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.appSetting.deleteMany();
});

async function actAs(user: { sub: string; role: 'client' | 'dealer' | 'admin' } | null) {
  const token = user ? await signSession(user, secret) : undefined;
  const entry = token === undefined ? undefined : { name: SESSION_COOKIE_NAME, value: token };
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === SESSION_COOKIE_NAME ? entry : undefined),
  } as Awaited<ReturnType<typeof cookies>>);
}

const admin = { sub: 'staff-admin', role: 'admin' } as const;

async function putDate(body: unknown) {
  const request = new Request('http://localhost/api/demo-date', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const response = await PUT(request, undefined);
  return { status: response.status, body: await response.json() };
}

describe('GET /api/demo-date', () => {
  it('needs no login and shows the real date by default', async () => {
    const response = await GET(new Request('http://localhost/api/demo-date'), undefined);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({ date: todayIso(), is_demo: false });
  });
});

describe('PUT /api/demo-date', () => {
  it('lets an admin set the date, and records who did it', async () => {
    await actAs(admin);
    const { status, body } = await putDate({ date: '2026-11-05' });
    expect(status).toBe(200);
    expect(body.data).toEqual({ date: '2026-11-05', is_demo: true });

    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit.actor).toBe('staff-admin');
  });

  it('lets an admin go back to the real date', async () => {
    await actAs(admin);
    await putDate({ date: '2026-11-05' });
    const { body } = await putDate({ date: null });
    expect(body.data).toEqual({ date: todayIso(), is_demo: false });
  });

  it('answers 401 without a login', async () => {
    await actAs(null);
    const { status, body } = await putDate({ date: '2026-11-05' });
    expect(status).toBe(401);
    expect(body.error.code).toBe('NOT_LOGGED_IN');
  });

  it.each([
    ['a client', { sub: 'cust-aino', role: 'client' } as const],
    ['a dealer', { sub: 'staff-dealer', role: 'dealer' } as const],
  ])('answers 403 for %s and changes nothing', async (_name, user) => {
    await actAs(user);
    const { status, body } = await putDate({ date: '2026-11-05' });
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(await db.appSetting.count()).toBe(0);
  });

  it.each([
    ['a badly formatted date', { date: '5.11.2026' }],
    ['a date that does not exist', { date: '2026-02-30' }],
    ['a missing date', {}],
    ['an unknown field', { date: '2026-11-05', actor: 'someone' }],
  ])('answers 400 for %s', async (_name, requestBody) => {
    await actAs(admin);
    const { status, body } = await putDate(requestBody);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
