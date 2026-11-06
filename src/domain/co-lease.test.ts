import { describe, expect, it } from 'vitest';
import { holderShareCents, shareProblem, sharesOn, splitCents } from './co-lease';
import { summarizeLease } from './lease-dashboard';

const row = (userId: string, percent: number, effectiveFrom: string, isHolder = false) => ({
  userId,
  percent,
  effectiveFrom,
  isHolder,
});

describe('splitCents', () => {
  it('splits 50/30/20 exactly', () => {
    expect(splitCents(10000, [50, 30, 20])).toEqual([5000, 3000, 2000]);
  });
  it('always adds up, giving leftover cents to the largest remainder', () => {
    expect(splitCents(13466, [50, 30, 20])).toEqual([6733, 4040, 2693]);
    expect(splitCents(100, [34, 33, 33])).toEqual([34, 33, 33]);
    expect(splitCents(1, [50, 50])).toEqual([1, 0]);
    expect(splitCents(101, [50, 25, 25])).toEqual([51, 25, 25]);
  });
  it('handles zero and rejects invalid input', () => {
    expect(splitCents(0, [100])).toEqual([0]);
    expect(() => splitCents(1.5, [100])).toThrow(RangeError);
    expect(() => splitCents(100, [50, 40])).toThrow(RangeError);
  });
});

describe('shareProblem', () => {
  const holder = { userId: 'a', percent: 50, isHolder: true };
  const other = { userId: 'b', percent: 50, isHolder: false };
  it('accepts a valid split and a holder alone at 100 %', () => {
    expect(shareProblem([holder, other])).toBeNull();
    expect(shareProblem([{ ...holder, percent: 100 }])).toBeNull();
  });
  it('names what is wrong', () => {
    expect(shareProblem([other])).toBe('no_holder');
    expect(shareProblem([holder, holder])).toBe('no_holder');
    expect(shareProblem([holder, { ...holder, isHolder: false }])).toBe('duplicate');
    expect(shareProblem([holder, { ...other, percent: 49 }])).toBe('not_100');
    expect(
      shareProblem([
        { ...holder, percent: 100 },
        { ...other, percent: 0 },
      ])
    ).toBe('invalid_percent');
    expect(shareProblem([holder, { ...other, percent: 49.5 }])).toBe('invalid_percent');
    expect(
      shareProblem([
        { ...holder, percent: 20 },
        ...['b', 'c', 'd', 'e', 'f'].map((userId) => ({ userId, percent: 16, isHolder: false })),
      ])
    ).toBe('too_many');
  });
});

describe('versions', () => {
  const rows = [
    row('b', 50, '2026-06-01'),
    row('a', 50, '2026-06-01', true),
    row('a', 100, '2026-09-01', true),
  ];
  it('uses the version in force on the date, holder first', () => {
    expect(sharesOn(rows, '2026-05-31')).toEqual([]);
    expect(sharesOn(rows, '2026-06-01').map((share) => share.userId)).toEqual(['a', 'b']);
    expect(sharesOn(rows, '2026-09-01').map((share) => share.percent)).toEqual([100]);
  });
  it('charges the holder everything until a split applies, and only their part after', () => {
    expect(holderShareCents(1001, rows, '2026-05-01')).toBe(1001);
    expect(holderShareCents(1001, rows, '2026-07-01')).toBe(501);
    expect(holderShareCents(1001, rows, '2026-10-01')).toBe(1001);
  });
});

describe('next payment', () => {
  const lease = {
    startDate: '2026-11-05',
    termMonths: 12,
    monthlyNetCents: 10000,
    listPriceCents: 100000,
    downPaymentCents: 0,
    isDemo: true,
    invoices: [],
  };
  const rates = [{ rate_percent: 25.5, valid_from: '2024-09-01', valid_to: null }];
  it('reports the whole amount and the holder part', () => {
    const { next } = summarizeLease(
      {
        ...lease,
        coLeaseShares: [row('a', 30, '2026-11-06', true), row('b', 70, '2026-11-06')],
      },
      rates,
      '2026-11-06'
    );
    expect(next).toMatchObject({ amountCents: 12550, shareCents: 3765 });
    expect(summarizeLease(lease, rates, '2026-11-06').next?.shareCents).toBe(12550);
  });
});
