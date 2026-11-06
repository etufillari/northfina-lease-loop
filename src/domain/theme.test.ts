import { describe, expect, it } from 'vitest';
import { effectiveTheme, otherTheme, parseTheme } from './theme';

describe('theme', () => {
  it('reads only light or dark from the cookie', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    for (const value of [undefined, null, '', 'Dark', 'system', 'blue']) {
      expect(parseTheme(value)).toBeNull();
    }
  });

  it("follows the device until the person picks one, then keeps the person's choice", () => {
    expect(effectiveTheme(null, false)).toBe('light');
    expect(effectiveTheme(null, true)).toBe('dark');
    expect(effectiveTheme('light', true)).toBe('light');
    expect(effectiveTheme('dark', false)).toBe('dark');
  });

  it('switches between the two', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });
});
