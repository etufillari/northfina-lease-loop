import { afterEach, describe, expect, it, vi } from 'vitest';

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined,
  }),
}));

const { DEMO_CLOCK_COOKIE, isIsoDay, readDemoClock, resolveToday, todayForRequest } =
  await import('./demo-clock');

describe('isIsoDay', () => {
  it('accepts a real calendar day', () => {
    expect(isIsoDay('2026-11-05')).toBe(true);
  });

  it('accepts the leap day of a leap year (card 4: 29 Feb 2028)', () => {
    expect(isIsoDay('2028-02-29')).toBe(true);
  });

  it.each([
    ['the leap day of a common year', '2026-02-29'],
    ['day 31 of a 30-day month', '2026-11-31'],
    ['month 13', '2026-13-01'],
    ['day zero', '2026-11-00'],
    ['a day without padding', '2026-11-5'],
    ['a timestamp', '2026-11-05T10:00:00Z'],
    ['an empty string', ''],
    ['words', 'tomorrow'],
  ])('rejects %s', (_label, value) => {
    expect(isIsoDay(value)).toBe(false);
  });
});

describe('resolveToday', () => {
  it('uses a valid override (the judges run a card dated September 2026)', () => {
    expect(resolveToday('2026-11-05', '2026-09-15')).toBe('2026-09-15');
  });

  it('ignores an invalid override and keeps the system day', () => {
    expect(resolveToday('2026-11-05', '2026-02-30')).toBe('2026-11-05');
    expect(resolveToday('2026-11-05', 'not a date')).toBe('2026-11-05');
  });

  it('keeps the system day when there is no override', () => {
    expect(resolveToday('2026-11-05', undefined)).toBe('2026-11-05');
    expect(resolveToday('2026-11-05', '')).toBe('2026-11-05');
  });
});

describe('todayForRequest', () => {
  afterEach(() => cookieStore.clear());

  it('reads the override from the demo clock cookie', async () => {
    cookieStore.set(DEMO_CLOCK_COOKIE, '2027-01-01');
    expect(await todayForRequest()).toBe('2027-01-01');
  });

  it('falls back to the real day without a cookie', async () => {
    expect(await todayForRequest()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to the real day when the cookie holds garbage', async () => {
    cookieStore.set(DEMO_CLOCK_COOKIE, '2027-99-99');
    expect(await todayForRequest()).not.toBe('2027-99-99');
  });
});

describe('readDemoClock', () => {
  afterEach(() => cookieStore.clear());

  it('says the day is moved when the cookie holds another valid day', async () => {
    cookieStore.set(DEMO_CLOCK_COOKIE, '1999-12-31');
    const clock = await readDemoClock();
    expect(clock).toMatchObject({ today: '1999-12-31', overridden: true });
    expect(clock.systemToday).not.toBe('1999-12-31');
  });

  it('says the day is real without a cookie', async () => {
    const clock = await readDemoClock();
    expect(clock.overridden).toBe(false);
    expect(clock.today).toBe(clock.systemToday);
  });
});

describe('demoClockCookieHeader', () => {
  it('sets the cookie to the day, for the whole site, http-only', async () => {
    const { demoClockCookieHeader } = await import('./demo-clock');
    expect(demoClockCookieHeader('2027-06-05')).toBe(
      `${DEMO_CLOCK_COOKIE}=2027-06-05; Path=/; HttpOnly; SameSite=Lax`
    );
  });

  it('clears it with null', async () => {
    const { demoClockCookieHeader } = await import('./demo-clock');
    expect(demoClockCookieHeader(null)).toMatch(new RegExp(`^${DEMO_CLOCK_COOKIE}=; .*Max-Age=0`));
  });
});
