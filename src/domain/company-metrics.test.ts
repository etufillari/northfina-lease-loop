import { describe, expect, it } from 'vitest';
import { axisTicks, companyMetrics, monthsEnding, type MetricsContract } from './company-metrics';

const today = '2026-11-06';
const lease = (overrides: Partial<MetricsContract> = {}): MetricsContract => ({
  category: 'e_bike',
  startDate: '2026-09-10',
  termMonths: 36,
  status: 'active',
  endedOn: null,
  downPaymentCents: 0,
  invoices: [],
  buyouts: [],
  ...overrides,
});
const at = (metrics: ReturnType<typeof companyMetrics>, month: string) =>
  metrics.months.indexOf(month);

describe('monthsEnding', () => {
  it('counts back across a year boundary, oldest first', () => {
    expect(monthsEnding('2026-02-28', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('rejects an invalid range', () => {
    expect(() => monthsEnding('nope', 4)).toThrow(RangeError);
    expect(() => monthsEnding(today, 0)).toThrow(RangeError);
  });
});

describe('companyMetrics', () => {
  it('totals revenue per category from invoices, down payments and buyouts', () => {
    const metrics = companyMetrics(
      [
        lease({
          downPaymentCents: 5000,
          invoices: [
            { dueDate: '2026-09-10', netCents: 1000 },
            { dueDate: '2026-10-10', netCents: 1000 },
          ],
          buyouts: [{ date: '2026-10-20', netCents: 7000 }],
        }),
        lease({
          category: 'laptop',
          invoices: [{ dueDate: '2026-10-01', netCents: 400 }],
        }),
      ],
      today,
      6
    );
    expect(metrics.revenueCents.e_bike[at(metrics, '2026-09')]).toBe(6000);
    expect(metrics.revenueCents.e_bike[at(metrics, '2026-10')]).toBe(8000);
    expect(metrics.revenueCents.laptop[at(metrics, '2026-10')]).toBe(400);
    expect(metrics.revenueCents.total[at(metrics, '2026-10')]).toBe(8400);
  });

  it('ignores anything dated after today or before the range', () => {
    const metrics = companyMetrics(
      [
        lease({
          invoices: [
            { dueDate: '2026-11-07', netCents: 999 },
            { dueDate: '2020-01-01', netCents: 999 },
          ],
        }),
      ],
      today,
      6
    );
    expect(metrics.revenueCents.total.every((value) => value === 0)).toBe(true);
  });

  it('counts a lease as active from its start until it ends', () => {
    const metrics = companyMetrics(
      [lease({ startDate: '2026-08-15', status: 'returned', endedOn: '2026-10-12' })],
      today,
      6
    );
    expect(metrics.activeLeases.total[at(metrics, '2026-07')]).toBe(0);
    expect(metrics.activeLeases.total[at(metrics, '2026-08')]).toBe(1);
    expect(metrics.activeLeases.total[at(metrics, '2026-09')]).toBe(1);
    expect(metrics.activeLeases.total[at(metrics, '2026-10')]).toBe(0);
    expect(metrics.newLeases.total[at(metrics, '2026-08')]).toBe(1);
  });

  it('counts the current month up to today, not to its end', () => {
    const metrics = companyMetrics(
      [
        lease({ startDate: '2026-11-06' }),
        lease({ startDate: '2026-11-07' }),
        lease({ startDate: '2026-01-01', status: 'returned', endedOn: '2026-11-06' }),
        lease({ startDate: '2026-01-01', status: 'returned', endedOn: '2026-11-20' }),
      ],
      today,
      3
    );
    expect(metrics.summary.activeNow).toBe(2);
    expect(metrics.summary.newThisMonth).toBe(1);
  });

  it('falls back to the contractual end when an ended lease has no recorded date', () => {
    const metrics = companyMetrics(
      [lease({ startDate: '2025-09-10', termMonths: 12, status: 'completed' })],
      today,
      6
    );
    expect(metrics.activeLeases.total[at(metrics, '2026-08')]).toBe(1);
    expect(metrics.activeLeases.total[at(metrics, '2026-09')]).toBe(0);
  });

  it('keeps an active lease running past its term until it is closed', () => {
    const metrics = companyMetrics([lease({ startDate: '2025-01-10', termMonths: 12 })], today, 3);
    expect(metrics.summary.activeNow).toBe(1);
  });

  it('summarises the last complete month, ignoring the current partial one', () => {
    const metrics = companyMetrics(
      [
        lease({
          invoices: [
            { dueDate: '2026-09-10', netCents: 1000 },
            { dueDate: '2026-10-10', netCents: 1500 },
            { dueDate: '2026-11-01', netCents: 9999 },
          ],
        }),
      ],
      today,
      6
    );
    expect(metrics.summary).toMatchObject({
      lastFullMonth: '2026-10',
      lastFullMonthRevenueCents: 1500,
      previousMonthRevenueCents: 1000,
    });
  });

  it('names the top category by trailing revenue, even with fewer leases', () => {
    const metrics = companyMetrics(
      [
        lease({ invoices: [{ dueDate: '2026-10-10', netCents: 2500 }] }),
        lease({ invoices: [{ dueDate: '2026-10-10', netCents: 2500 }] }),
        lease({
          category: 'farm_machine',
          invoices: [{ dueDate: '2026-10-10', netCents: 15000 }],
        }),
      ],
      today
    );
    expect(metrics.summary).toMatchObject({
      topCategory: 'farm_machine',
      topCategorySharePercent: 75,
    });
  });

  it('has no top category and no last full month when there is nothing to report', () => {
    expect(companyMetrics([], today).summary).toMatchObject({
      topCategory: null,
      activeNow: 0,
      lastFullMonthRevenueCents: 0,
    });
    expect(companyMetrics([], today, 1).summary.lastFullMonth).toBeNull();
  });
});

describe('axisTicks', () => {
  it('uses clean steps that reach the maximum', () => {
    expect(axisTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(axisTicks(8300)).toEqual([0, 2500, 5000, 7500, 10000]);
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });
  it('keeps counts whole and handles an empty chart', () => {
    expect(axisTicks(3, true)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(0)).toEqual([0, 1]);
  });
  it('rejects an invalid range', () => {
    expect(() => axisTicks(-1)).toThrow(RangeError);
    expect(() => axisTicks(Number.NaN)).toThrow(RangeError);
  });
});
