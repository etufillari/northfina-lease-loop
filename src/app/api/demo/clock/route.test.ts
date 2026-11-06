// POST /api/demo/clock sets the demo clock cookie to a day and clears it with null, through
// demoClockCookieHeader (the one writer of that cookie), and refuses a day that does not exist.
import { describe, expect, it } from 'vitest';
import { DEMO_CLOCK_COOKIE } from '@/server/demo-clock';
import { todayIso } from '@/server/today';
import { POST } from './route';

async function post(body: unknown) {
  const request = new Request('http://localhost/api/demo/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({}) });
  return {
    status: response.status,
    cookies: response.headers.getSetCookie(),
    body: await response.json(),
  };
}

describe('POST /api/demo/clock', () => {
  it('travels to a day: the cookie holds it for the whole site, the body says so', async () => {
    const { status, cookies, body } = await post({ asOf: '2028-02-29' });
    expect(status).toBe(200);
    expect(body.data).toEqual({ asOf: '2028-02-29', today: '2028-02-29' });
    expect(cookies).toEqual([`${DEMO_CLOCK_COOKIE}=2028-02-29; Path=/; HttpOnly; SameSite=Lax`]);
  });

  it('goes back to the real day with null: the cookie expires', async () => {
    const { status, cookies, body } = await post({ asOf: null });
    expect(status).toBe(200);
    expect(body.data).toEqual({ asOf: null, today: todayIso() });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(new RegExp(`^${DEMO_CLOCK_COOKIE}=; .*Max-Age=0`));
  });

  it('refuses a day that does not exist with 400 and sets nothing', async () => {
    const { status, cookies } = await post({ asOf: '2026-02-29' });
    expect(status).toBe(400);
    expect(cookies).toEqual([]);
  });
});
