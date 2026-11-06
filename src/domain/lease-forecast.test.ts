import { describe, expect, it } from 'vitest';
import {
  MAX_RANGE_DAYS,
  buildForecast,
  daysBetween,
  presetRange,
  resolveForecastRange,
  type ForecastLease,
} from './lease-forecast';

describe('daysBetween', () => {
  it('counts whole days, forwards and backwards', () => {
    expect(daysBetween('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysBetween('2026-11-05', '2026-11-06')).toBe(1);
    expect(daysBetween('2026-11-06', '2026-11-05')).toBe(-1);
    expect(daysBetween('2026-11-05', '2026-12-05')).toBe(30);
  });

  it('crosses month and year ends', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
  });

  it('knows leap years: 2028 has a 29 February, 2027 and 2100 do not', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2100-02-28', '2100-03-01')).toBe(1);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('rejects dates that are not real days', () => {
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => daysBetween('nope', '2026-03-01')).toThrow(RangeError);
  });
});

describe('presetRange', () => {
  it('this month is the 1st to the last day of the current month', () => {
    expect(presetRange('2026-11-05', 'this_month')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('next month is the whole following month, from any day of the current one', () => {
    expect(presetRange('2026-11-05', 'next_month')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(presetRange('2026-11-30', 'next_month')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(presetRange('2026-11-01', 'next_month')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('rolls over the year end', () => {
    expect(presetRange('2026-12-15', 'next_month')).toEqual({
      from: '2027-01-01',
      to: '2027-01-31',
    });
  });

  it('ends next month on the right day in short months and leap years', () => {
    expect(presetRange('2027-01-31', 'next_month')).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
    expect(presetRange('2028-01-31', 'next_month')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('next three months spans the three months after this one', () => {
    expect(presetRange('2026-11-05', 'next_three_months')).toEqual({
      from: '2026-12-01',
      to: '2027-02-28',
    });
  });
});

describe('resolveForecastRange', () => {
  const today = '2026-11-05';

  it('defaults to next month', () => {
    expect(resolveForecastRange(today)).toEqual({
      ok: true,
      range: { from: '2026-12-01', to: '2026-12-31' },
      preset: 'next_month',
    });
  });

  it('recognises a preset typed out as dates', () => {
    expect(resolveForecastRange(today, { from: '2026-11-01', to: '2026-11-30' })).toMatchObject({
      ok: true,
      preset: 'this_month',
    });
  });

  it('accepts a custom range, a single day, and no preset', () => {
    expect(resolveForecastRange(today, { from: '2026-12-10', to: '2026-12-20' })).toEqual({
      ok: true,
      range: { from: '2026-12-10', to: '2026-12-20' },
      preset: null,
    });
    expect(resolveForecastRange(today, { from: '2026-12-10', to: '2026-12-10' })).toMatchObject({
      ok: true,
    });
  });

  it('refuses a half-given range', () => {
    expect(resolveForecastRange(today, { from: '2026-12-10' })).toEqual({
      ok: false,
      reason: 'incomplete_range',
    });
    expect(resolveForecastRange(today, { to: '2026-12-10' })).toEqual({
      ok: false,
      reason: 'incomplete_range',
    });
  });

  it('refuses dates that are not real days', () => {
    expect(resolveForecastRange(today, { from: '2026-02-30', to: '2026-03-10' })).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
    expect(resolveForecastRange(today, { from: 'soon', to: 'later' })).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });

  it('refuses a range that runs backwards', () => {
    expect(resolveForecastRange(today, { from: '2026-12-20', to: '2026-12-10' })).toEqual({
      ok: false,
      reason: 'from_after_to',
    });
  });

  it('allows the longest range and refuses one day more', () => {
    const from = '2026-01-01';
    // 2026 and 2027 have 730 days, so 1 January 2028 is the 731st day: exactly the limit.
    expect(MAX_RANGE_DAYS).toBe(731);
    expect(resolveForecastRange(today, { from, to: '2028-01-01' })).toMatchObject({ ok: true });
    expect(resolveForecastRange(today, { from, to: '2028-01-02' })).toEqual({
      ok: false,
      reason: 'range_too_long',
    });
  });
});

function lease(overrides: Partial<ForecastLease> & { endDate: string }): ForecastLease {
  return {
    contractId: `c-${overrides.endDate}`,
    assetId: 'ebike-001',
    category: 'e_bike',
    customerId: 'cust-aino',
    openReturn: null,
    ...overrides,
  };
}

describe('buildForecast', () => {
  const today = '2026-11-05';
  const range = { from: '2026-12-01', to: '2026-12-31' };

  it('keeps only leases ending inside the range, both ends included', () => {
    const forecast = buildForecast({
      today,
      range,
      leases: [
        lease({ endDate: '2026-11-30' }),
        lease({ endDate: '2026-12-01', contractId: 'first' }),
        lease({ endDate: '2026-12-31', contractId: 'last' }),
        lease({ endDate: '2027-01-01' }),
      ],
    });

    expect(forecast.entries.map((e) => e.contractId)).toEqual(['first', 'last']);
    expect(forecast.summary.total).toBe(2);
  });

  it('sorts by end date, then asset id, then contract id, whatever the input order', () => {
    const leases = [
      lease({ endDate: '2026-12-10', assetId: 'laptop-002', contractId: 'b' }),
      lease({ endDate: '2026-12-02', assetId: 'ebike-009', contractId: 'a' }),
      lease({ endDate: '2026-12-10', assetId: 'laptop-001', contractId: 'z' }),
      lease({ endDate: '2026-12-10', assetId: 'laptop-001', contractId: 'y' }),
    ];

    const order = (list: ForecastLease[]) =>
      buildForecast({ today, range, leases: list }).entries.map((e) => e.contractId);

    expect(order(leases)).toEqual(['a', 'y', 'z', 'b']);
    expect(order([...leases].reverse())).toEqual(['a', 'y', 'z', 'b']);
  });

  it('gives the days left and the phase', () => {
    const forecast = buildForecast({
      today,
      range: { from: '2026-10-01', to: '2026-12-31' },
      leases: [
        lease({ endDate: '2026-10-30', contractId: 'late' }),
        lease({ endDate: '2026-11-05', contractId: 'today' }),
        lease({ endDate: '2026-11-12', contractId: 'week' }),
        lease({ endDate: '2026-11-13', contractId: 'later' }),
      ],
    });

    expect(forecast.entries.map((e) => [e.contractId, e.daysUntilEnd, e.phase])).toEqual([
      ['late', -6, 'overdue'],
      ['today', 0, 'soon'],
      ['week', 7, 'soon'],
      ['later', 8, 'upcoming'],
    ]);
  });

  it('summarises by category, return request and phase', () => {
    const forecast = buildForecast({
      today,
      range: { from: '2026-10-01', to: '2026-12-31' },
      leases: [
        lease({ endDate: '2026-12-02', category: 'e_bike' }),
        lease({ endDate: '2026-12-03', category: 'laptop', contractId: 'l1' }),
        lease({
          endDate: '2026-11-08',
          category: 'laptop',
          contractId: 'l2',
          openReturn: { id: 'r1', status: 'requested' },
        }),
        lease({ endDate: '2026-10-20', category: 'farm_machine', contractId: 'f1' }),
      ],
    });

    expect(forecast.summary).toEqual({
      total: 4,
      byCategory: { e_bike: 1, laptop: 2, farm_machine: 1 },
      returnRequested: 1,
      noReturnYet: 3,
      endingSoon: 1,
      overdue: 1,
    });
  });

  it('returns an empty forecast with zero counts when nothing ends in the range', () => {
    expect(buildForecast({ today, range, leases: [] })).toEqual({
      range,
      entries: [],
      summary: {
        total: 0,
        byCategory: { e_bike: 0, laptop: 0, farm_machine: 0 },
        returnRequested: 0,
        noReturnYet: 0,
        endingSoon: 0,
        overdue: 0,
      },
    });
  });

  it('does not change its input', () => {
    const leases = [lease({ endDate: '2026-12-10' }), lease({ endDate: '2026-12-02' })];
    const copy = structuredClone(leases);

    buildForecast({ today, range, leases });

    expect(leases).toEqual(copy);
  });
});
