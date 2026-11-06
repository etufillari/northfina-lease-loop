import { afterEach, describe, expect, it, vi } from 'vitest';

const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'lease-loop.demo-date' && cookieValue.current !== undefined
        ? { name, value: cookieValue.current }
        : undefined,
  }),
}));

import { appToday, cookieFrom, requestToday } from './demo-mode';

// 10:00 UTC on 6 November 2026 is 12:00 in Helsinki: the real "today" is 2026-11-06.
const now = new Date('2026-11-06T10:00:00Z');
afterEach(() => {
  cookieValue.current = undefined;
  vi.unstubAllEnvs();
});

describe('appToday', () => {
  it('uses the demo date in demo mode', async () => {
    vi.stubEnv('LEASE_LOOP_DEMO', 'true');
    cookieValue.current = '2026-09-15';
    expect(await appToday(now)).toBe('2026-09-15');
  });
  it('uses the real Helsinki date without a valid demo date', async () => {
    vi.stubEnv('LEASE_LOOP_DEMO', 'true');
    expect(await appToday(now)).toBe('2026-11-06');
    cookieValue.current = 'not-a-date';
    expect(await appToday(now)).toBe('2026-11-06');
  });
  it('ignores a demo-date cookie when demo mode is off', async () => {
    vi.stubEnv('LEASE_LOOP_DEMO', 'false');
    cookieValue.current = '2026-09-15';
    expect(await appToday(now)).toBe('2026-11-06');
  });
});

describe('requestToday', () => {
  const request = (cookie?: string) =>
    new Request('http://localhost:3000/api/x', { headers: cookie ? { cookie } : {} });
  it('reads the demo date from the request cookies in demo mode', () => {
    vi.stubEnv('LEASE_LOOP_DEMO', 'true');
    expect(requestToday(request('a=1; lease-loop.demo-date=2026-01-31; b=2'), now)).toBe(
      '2026-01-31'
    );
  });
  it('uses the real date without the cookie, with an invalid one, or when demo mode is off', () => {
    vi.stubEnv('LEASE_LOOP_DEMO', 'true');
    expect(requestToday(request(), now)).toBe('2026-11-06');
    expect(requestToday(request('lease-loop.demo-date=2099-01-01'), now)).toBe('2026-11-06');
    vi.stubEnv('LEASE_LOOP_DEMO', 'false');
    expect(requestToday(request('lease-loop.demo-date=2026-01-31'), now)).toBe('2026-11-06');
  });
});

describe('cookieFrom', () => {
  it('finds a cookie by exact name only', () => {
    expect(
      cookieFrom('x-lease-loop.demo-date=1; lease-loop.demo-date=2', 'lease-loop.demo-date')
    ).toBe('2');
    expect(cookieFrom(null, 'a')).toBeUndefined();
    expect(cookieFrom('a', 'a')).toBeUndefined();
  });
});
