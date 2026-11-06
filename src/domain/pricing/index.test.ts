import { describe, expect, it } from 'vitest';
import * as pricing from './index';

describe('pricing index', () => {
  it('exports the public functions and the 14-day validity (D7)', () => {
    expect(typeof pricing.priceQuote).toBe('function');
    expect(typeof pricing.compareTerms).toBe('function');
    expect(typeof pricing.quoteStatusOn).toBe('function');
    expect(typeof pricing.breakdownFromFrozen).toBe('function');
    expect(pricing.addDays('2026-11-05', pricing.QUOTE_VALID_DAYS)).toBe('2026-11-19');
  });
});
