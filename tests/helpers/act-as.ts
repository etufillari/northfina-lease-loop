// Logs a route test in as someone, by faking the session cookie. The test file must mock
// 'next/headers' itself (`vi.mock('next/headers', () => ({ cookies: vi.fn() }))`) and call
// `vi.stubEnv('JWT_SECRET', TEST_SECRET)`.
import { cookies } from 'next/headers';
import { vi } from 'vitest';
import type { Role } from '@/domain/identity';
import { SESSION_COOKIE_NAME, signSession } from '@/server/session';

export const TEST_SECRET = 'test-secret-at-least-this-long';

export const AINO = { sub: 'cust-aino', role: 'client' } as const;
export const ADMIN = { sub: 'staff-admin', role: 'admin' } as const;
export const DEALER = { sub: 'staff-dealer', role: 'dealer' } as const;

/** Acts as `user`, or as nobody when `null`. */
export async function actAs(user: { sub: string; role: Role } | null) {
  const token = user ? await signSession(user, TEST_SECRET) : undefined;
  const entry = token === undefined ? undefined : { name: SESSION_COOKIE_NAME, value: token };
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === SESSION_COOKIE_NAME ? entry : undefined),
  } as Awaited<ReturnType<typeof cookies>>);
}
