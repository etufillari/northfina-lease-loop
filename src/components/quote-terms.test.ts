import { describe, expect, it } from 'vitest';
import { termControl } from './quote-terms';

describe('termControl (D43: how the page shows the allowed terms)', () => {
  it('is a slider over several terms', () => {
    expect(termControl([12, 24, 36])).toBe('slider');
    expect(termControl([12, 24, 36, 48])).toBe('slider');
  });

  it('is a static line for exactly one term, never a 0-to-0 slider', () => {
    expect(termControl([12])).toBe('static');
  });

  it('is none when no term is allowed, so the page shows a notice instead of a calculator', () => {
    expect(termControl([])).toBe('none');
  });
});
