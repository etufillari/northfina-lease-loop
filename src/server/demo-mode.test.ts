// With DEMO_MODE=off nobody can move "today": no ?asOf= and no time-travel cookie, so a
// quote, a hold or an age check cannot be backdated. In demo mode both work (the default).
import { afterEach, describe, expect, it } from 'vitest';
import { asOfFrom } from './as-of';
import { demoMode } from './demo-mode';
import { todayIso } from './today';

const request = (url: string, cookie?: string) =>
  new Request(url, cookie ? { headers: { cookie } } : undefined);

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe('demo mode', () => {
  it('is on unless switched off', () => {
    expect(demoMode()).toBe(true);
    process.env.DEMO_MODE = 'off';
    expect(demoMode()).toBe(false);
  });

  it('in demo mode ?asOf= wins, then the shared clock, then the time-travel cookie', async () => {
    expect(await asOfFrom(request('http://x/api?asOf=2026-01-31'))).toBe('2026-01-31');
    // No database in this test, so the shared clock yields nothing and the cookie holds.
    expect(await asOfFrom(request('http://x/api', 'asOf=2026-11-05'))).toBe('2026-11-05');
  });

  it('switched off, "today" is the real date whatever the request says', async () => {
    process.env.DEMO_MODE = 'off';
    expect(await asOfFrom(request('http://x/api?asOf=2026-01-31'))).toBe(todayIso());
    expect(await asOfFrom(request('http://x/api', 'asOf=2026-11-05'))).toBe(todayIso());
  });
});
