import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, fractionToPpm, mulDivRound, percentToBp } from './rounding';

describe('mulDivRound', () => {
  it('matches the worked example in DATA.md', () => {
    expect(mulDivRound(389_000, 27_584, 1_000_000)).toBe(10_730); // 10 730.176
    expect(mulDivRound(10_730, 2_550, 10_000)).toBe(2_736); // 2 736.15
    expect(mulDivRound(389_000, 15, 100)).toBe(58_350);
  });

  it('rounds an exact half up', () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(3, 1, 2)).toBe(2);
    expect(mulDivRound(5, 5_000, 10_000)).toBe(3); // 2.5 → 3
  });

  it('rounds below a half down', () => {
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(10_000, 2_549, 10_000_000)).toBe(3); // 2.549
  });

  it('gets halves right where float math does not', () => {
    // 1.005 * 100 is 100.49999… in floating point, so Math.round gives 100.
    expect(mulDivRound(1_005, 100, 1_000)).toBe(101);
  });

  it('returns 0 for a zero amount', () => {
    expect(mulDivRound(0, 2_550, 10_000)).toBe(0);
  });

  it('throws on non-integer or negative input', () => {
    expect(() => mulDivRound(10.5, 1, 1)).toThrow(RangeError);
    expect(() => mulDivRound(10, 1.5, 1)).toThrow(RangeError);
    expect(() => mulDivRound(-1, 1, 1)).toThrow(RangeError);
    expect(() => mulDivRound(1, -1, 1)).toThrow(RangeError);
  });

  it('throws on a zero or negative denominator', () => {
    expect(() => mulDivRound(1, 1, 0)).toThrow(RangeError);
    expect(() => mulDivRound(1, 1, -2)).toThrow(RangeError);
  });

  it('throws when the product would lose precision', () => {
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  });

  it('is within half a unit of the exact answer (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 25_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (a, num, den) => {
          const result = mulDivRound(a, num, den);
          // Compare in BigInt so the check itself has no float error.
          const twice = BigInt(result) * 2n * BigInt(den);
          const exact = 2n * BigInt(a) * BigInt(num);
          return twice - exact <= BigInt(den) && exact - twice < BigInt(den);
        }
      )
    );
  });
});

describe('allocate', () => {
  it('splits evenly when it can', () => {
    expect(allocate(300, 3)).toEqual([100, 100, 100]);
  });

  it('gives leftover cents to the earliest parts', () => {
    expect(allocate(100, 3)).toEqual([34, 33, 33]);
    expect(allocate(5, 3)).toEqual([2, 2, 1]);
  });

  it('handles a total smaller than the number of parts', () => {
    expect(allocate(2, 4)).toEqual([1, 1, 0, 0]);
  });

  it('handles a zero total and a single part', () => {
    expect(allocate(0, 3)).toEqual([0, 0, 0]);
    expect(allocate(777, 1)).toEqual([777]);
  });

  it('throws on bad input', () => {
    expect(() => allocate(10, 0)).toThrow(RangeError);
    expect(() => allocate(-1, 2)).toThrow(RangeError);
    expect(() => allocate(1.5, 2)).toThrow(RangeError);
  });

  it('parts sum to the total and differ by at most 1 cent (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 120 }),
        (total, n) => {
          const parts = allocate(total, n);
          const sum = parts.reduce((s, p) => s + p, 0);
          return (
            parts.length === n && sum === total && Math.max(...parts) - Math.min(...parts) <= 1
          );
        }
      )
    );
  });
});

describe('rate conversion', () => {
  it('converts percentages to basis points', () => {
    expect(percentToBp(25.5)).toBe(2_550);
    expect(percentToBp(26)).toBe(2_600);
    expect(percentToBp(7.9)).toBe(790);
    expect(percentToBp(0)).toBe(0);
  });

  it('converts factors to parts per million', () => {
    expect(fractionToPpm(0.027584)).toBe(27_584);
    expect(fractionToPpm(0.056022)).toBe(56_022);
  });

  it('throws when the value has more precision than the unit holds', () => {
    expect(() => percentToBp(25.555)).toThrow();
    expect(() => fractionToPpm(0.0275845)).toThrow();
  });
});
