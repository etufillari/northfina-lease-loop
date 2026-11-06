import { describe, expect, it } from 'vitest';
import { divideHalfUp } from './rounding';

describe('divideHalfUp', () => {
  it('rounds down below the half', () => {
    expect(divideHalfUp(1, 3)).toBe(0);
    expect(divideHalfUp(10730176, 1000)).toBe(10730);
  });

  it('rounds up from exactly the half', () => {
    expect(divideHalfUp(5, 2)).toBe(3);
    expect(divideHalfUp(3, 2)).toBe(2);
    expect(divideHalfUp(15, 10)).toBe(2);
  });

  it('rounds up above the half', () => {
    expect(divideHalfUp(2, 3)).toBe(1);
  });

  it('is exact on whole results', () => {
    expect(divideHalfUp(0, 7)).toBe(0);
    expect(divideHalfUp(21, 7)).toBe(3);
  });

  it('throws on floats and bad signs, because those are caller bugs', () => {
    expect(() => divideHalfUp(1.5, 2)).toThrow(RangeError);
    expect(() => divideHalfUp(3, 2.5)).toThrow(RangeError);
    expect(() => divideHalfUp(-1, 2)).toThrow(RangeError);
    expect(() => divideHalfUp(1, 0)).toThrow(RangeError);
  });
});
