// The breakdown's step 2 writes the factor as the share of the financed amount paid each month.
import { describe, expect, it } from 'vitest';
import { formatMonthlySharePercent } from './quote-breakdown';

describe('formatMonthlySharePercent', () => {
  it('writes card 1’s factor 0.027584 (27 584 millionths) as 2.7584, every digit kept', () => {
    expect(formatMonthlySharePercent(27_584, 'en')).toBe('2.7584');
  });

  it('uses the language’s decimal mark', () => {
    expect(formatMonthlySharePercent(27_584, 'fi')).toBe('2,7584');
    expect(formatMonthlySharePercent(27_584, 'sv')).toBe('2,7584');
    expect(formatMonthlySharePercent(27_584, 'et')).toBe('2,7584');
  });

  it('keeps four decimals, so financed × share on the page gives the same cents (card 7: 2.1763)', () => {
    expect(formatMonthlySharePercent(21_763, 'en')).toBe('2.1763');
    expect(formatMonthlySharePercent(50_000, 'en')).toBe('5.0000');
  });
});
