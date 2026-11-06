import { describe, expect, it } from 'vitest';
import * as contracts from './index';

describe('contracts index', () => {
  it('exports the signing plan, the price-lock explanation, the number rule and the one-year start limit (D45)', () => {
    expect(typeof contracts.planContract).toBe('function');
    expect(typeof contracts.priceLockOf).toBe('function');
    expect(contracts.contractNumber('2026-11-05', 'app-1')).toBe('LL-20261105-APP-1');
    expect(contracts.START_MONTHS_MAX).toBe(12);
  });
});
