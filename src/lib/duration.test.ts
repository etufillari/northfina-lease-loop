import { describe, expect, it } from 'vitest';
import { hours, minutes, seconds } from './duration';

describe('seconds', () => {
  it('returns its input unchanged', () => {
    expect(seconds(30)).toBe(30);
    expect(seconds(0)).toBe(0);
  });
});

describe('minutes', () => {
  it('converts minutes to seconds', () => {
    expect(minutes(1)).toBe(60);
    expect(minutes(5)).toBe(300);
    expect(minutes(0)).toBe(0);
  });
});

describe('hours', () => {
  it('converts hours to seconds', () => {
    expect(hours(1)).toBe(3600);
    expect(hours(12)).toBe(43_200);
    expect(hours(0)).toBe(0);
  });
});
