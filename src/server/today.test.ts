import { describe, expect, it } from 'vitest';
import { resolveAppDate, todayIso } from './today';

describe('todayIso', () => {
  it('returns the date in Helsinki, not in UTC', () => {
    // 22:30 UTC on 5 November is already 6 November in Helsinki (UTC+2 in winter).
    expect(todayIso(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-06');
    expect(todayIso(new Date('2026-11-05T21:30:00Z'))).toBe('2026-11-05');
  });

  it('can use another time zone', () => {
    expect(todayIso(new Date('2026-11-05T22:30:00Z'), 'UTC')).toBe('2026-11-05');
  });

  it('uses the real clock by default', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('resolveAppDate', () => {
  const REAL = '2026-11-06';

  it('uses the real date when no time-travel date is set', () => {
    expect(resolveAppDate(undefined, REAL)).toEqual({
      today: REAL,
      realToday: REAL,
      simulated: false,
    });
  });

  it('uses a valid time-travel date, backwards or forwards', () => {
    expect(resolveAppDate('2027-01-15', REAL)).toEqual({
      today: '2027-01-15',
      realToday: REAL,
      simulated: true,
    });
    expect(resolveAppDate('2026-09-15', REAL)).toMatchObject({ today: '2026-09-15' });
  });

  it('is not "simulated" when the time-travel date is today', () => {
    expect(resolveAppDate(REAL, REAL).simulated).toBe(false);
  });

  it('ignores malformed, impossible and out-of-range dates', () => {
    for (const value of ['', 'tomorrow', '2026-02-31', '2026-13-01', '1999-12-31', '2026-1-5']) {
      expect(resolveAppDate(value, REAL)).toMatchObject({ today: REAL, simulated: false });
    }
  });
});
