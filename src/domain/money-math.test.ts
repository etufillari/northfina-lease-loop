import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import {
  applyMillionths,
  factorToMillionths,
  percentOf,
  percentToBasisPoints,
  roundHalfUpDiv,
  roundHalfUpDivBig,
  splitVat,
} from './money-math';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('roundHalfUpDivBig', () => {
  it('rounds like roundHalfUpDiv, past the safe-integer range too', () => {
    expect(roundHalfUpDivBig(5n, 10n)).toBe(1n);
    expect(roundHalfUpDivBig(272_037_500_000n, 1_000_000n)).toBe(272_038n);
    expect(roundHalfUpDivBig(10_730_176n, 1_000n)).toBe(10_730n);
    const big = 2n ** 80n;
    expect(roundHalfUpDivBig(big * 3n + big / 2n, big)).toBe(4n);
    expect(roundHalfUpDivBig(big * 3n + big / 2n - 1n, big)).toBe(3n);
  });

  it('throws on a negative numerator or a denominator of zero', () => {
    expect(() => roundHalfUpDivBig(-1n, 2n)).toThrow(RangeError);
    expect(() => roundHalfUpDivBig(1n, 0n)).toThrow(RangeError);
  });
});

describe('roundHalfUpDiv', () => {
  it('rounds an exact half up', () => {
    expect(roundHalfUpDiv(5, 10)).toBe(1);
    expect(roundHalfUpDiv(272_037_500_000, 1_000_000)).toBe(272_038);
  });

  it('rounds just below a half down', () => {
    expect(roundHalfUpDiv(4_999, 10_000)).toBe(0);
    expect(roundHalfUpDiv(14_999, 10_000)).toBe(1);
  });

  it('returns exact quotients unchanged and handles zero', () => {
    expect(roundHalfUpDiv(30, 10)).toBe(3);
    expect(roundHalfUpDiv(0, 7)).toBe(0);
  });

  it('throws on negative, non-integer or non-positive inputs', () => {
    expect(() => roundHalfUpDiv(-1, 10)).toThrow(RangeError);
    expect(() => roundHalfUpDiv(1.5, 10)).toThrow(RangeError);
    expect(() => roundHalfUpDiv(1, 0)).toThrow(RangeError);
    expect(() => roundHalfUpDiv(1, -2)).toThrow(RangeError);
    expect(() => roundHalfUpDiv(1, 2.5)).toThrow(RangeError);
  });
});

describe('factorToMillionths', () => {
  it('converts six-decimal factors exactly', () => {
    expect(factorToMillionths(0.027584)).toBe(27_584);
    expect(factorToMillionths(0.021763)).toBe(21_763);
    expect(factorToMillionths(0)).toBe(0);
  });

  it('converts every factor in the real coefficient table exactly', () => {
    for (const band of table.bands) {
      for (const factor of Object.values(band.monthly_factor_by_term)) {
        expect(factorToMillionths(factor) / 1_000_000).toBe(factor);
      }
    }
  });

  it('throws on more than six decimals or a negative factor', () => {
    expect(() => factorToMillionths(0.0275841)).toThrow(RangeError);
    expect(() => factorToMillionths(-0.01)).toThrow(RangeError);
    expect(() => factorToMillionths(Number.NaN)).toThrow(RangeError);
  });
});

describe('applyMillionths', () => {
  it('reproduces the worked example: 389 000 × 0.027584 = 10 730.176 → 10 730', () => {
    expect(applyMillionths(389_000, factorToMillionths(0.027584))).toBe(10_730);
  });

  it('rounds card 7 up: 12 500 000 × the band D 48-month factor = 272 037.5 → 272 038', () => {
    const result = monthlyFactorFor(table, 12_500_000, 48);
    expect(result).toMatchObject({ ok: true, factor: 0.021763 });
    if (!result.ok) throw new Error('expected a factor');
    expect(applyMillionths(12_500_000, factorToMillionths(result.factor))).toBe(272_038);
  });

  it('throws when the product leaves the safe integer range', () => {
    expect(() => applyMillionths(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });

  it('throws on negative or non-integer cents', () => {
    expect(() => applyMillionths(-100, 27_584)).toThrow(RangeError);
    expect(() => applyMillionths(100.5, 27_584)).toThrow(RangeError);
  });
});

describe('percentOf and splitVat', () => {
  it('takes 25.5 % of 10 730: 2 736.15 → 2 736, gross 13 466', () => {
    expect(percentOf(10_730, 2_550)).toBe(2_736);
    expect(splitVat(10_730, 2_550)).toEqual({
      netCents: 10_730,
      vatCents: 2_736,
      grossCents: 13_466,
    });
  });

  it('takes 26 % of 10 730: 2 789.8 → 2 790, gross 13 520', () => {
    expect(splitVat(10_730, 2_600)).toEqual({
      netCents: 10_730,
      vatCents: 2_790,
      grossCents: 13_520,
    });
  });

  it('rounds a half cent of VAT up', () => {
    // 10 cents × 5 % = 0.5 cents → 1
    expect(percentOf(10, 500)).toBe(1);
  });

  it('throws on negative or non-integer inputs', () => {
    expect(() => percentOf(-1, 2_550)).toThrow(RangeError);
    expect(() => splitVat(10.5, 2_550)).toThrow(RangeError);
    expect(() => percentOf(100, 25.5)).toThrow(RangeError);
  });
});

describe('percentToBasisPoints', () => {
  it('converts percents with up to two decimals', () => {
    expect(percentToBasisPoints(25.5)).toBe(2_550);
    expect(percentToBasisPoints(26)).toBe(2_600);
    expect(percentToBasisPoints(24.0)).toBe(2_400);
    expect(percentToBasisPoints(0.01)).toBe(1);
  });

  it('throws on more than two decimals or a negative percent', () => {
    expect(() => percentToBasisPoints(25.555)).toThrow(RangeError);
    expect(() => percentToBasisPoints(-1)).toThrow(RangeError);
  });
});
