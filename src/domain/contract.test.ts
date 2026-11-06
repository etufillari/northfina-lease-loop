import { describe, expect, it } from 'vitest';
import { contractDatesFor } from './contract';

describe('contractDatesFor', () => {
  it('calculates the anniversary boundary for a normal date', () => {
    expect(contractDatesFor('2026-11-05', 36)).toEqual({
      startsOn: '2026-11-05',
      endsOn: '2029-11-05',
    });
  });

  it('clamps January 31 to February 28', () => {
    expect(contractDatesFor('2026-01-31', 1).endsOn).toBe('2026-02-28');
  });

  it('clamps January 31 to leap-day February', () => {
    expect(contractDatesFor('2028-01-31', 1).endsOn).toBe('2028-02-29');
  });

  it('keeps a month-end start on month-end after clamping', () => {
    expect(contractDatesFor('2026-04-30', 1).endsOn).toBe('2026-05-31');
  });

  it('supports dynamic terms', () => {
    expect(contractDatesFor('2026-03-15', 3).endsOn).toBe('2026-06-15');
  });

  it('rejects invalid dates and terms', () => {
    expect(() => contractDatesFor('2026-02-30', 1)).toThrow(RangeError);
    expect(() => contractDatesFor('2026-01-01', 0)).toThrow(RangeError);
    expect(() => contractDatesFor('2026-01-01', 1.5)).toThrow(RangeError);
  });
});
