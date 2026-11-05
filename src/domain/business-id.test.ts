import { describe, expect, it } from 'vitest';
import { isValidBusinessId } from './business-id';

// Check digits worked out by hand: weights 7 9 10 5 8 4 2, r = sum mod 11, digit = 11 − r
// (0 when r is 0; no valid digit when r is 1).
describe('isValidBusinessId', () => {
  it('accepts the data pack’s valid business IDs', () => {
    for (const id of ['3012456-5', '3187650-7', '2876543-5', '3299871-7']) {
      expect(isValidBusinessId(id)).toBe(true);
    }
  });

  it('rejects Typo Trading’s 1234567-8: the check digit should be 1', () => {
    // 1·7 + 2·9 + 3·10 + 4·5 + 5·8 + 6·4 + 7·2 = 153; 153 mod 11 = 10; 11 − 10 = 1.
    expect(isValidBusinessId('1234567-8')).toBe(false);
    expect(isValidBusinessId('1234567-1')).toBe(true);
  });

  it('uses 0 as the check digit when the remainder is 0', () => {
    // 1·7 + 5·9 + 7·10 + 2·5 + 8·8 + 6·4 + 0·2 = 220; 220 mod 11 = 0, so the digit is 0.
    expect(isValidBusinessId('1572860-0')).toBe(true);
  });

  it('has no valid check digit when the remainder is 1', () => {
    // 1·7 + 8·2 = 23; 23 mod 11 = 1, and 11 − 1 = 10 is not a digit.
    for (let digit = 0; digit <= 9; digit++) {
      expect(isValidBusinessId(`1000008-${digit}`)).toBe(false);
    }
  });

  it('rejects anything that is not seven digits, a hyphen and one digit', () => {
    for (const id of [
      '',
      '1234567',
      '12345671',
      '123456-1',
      '1234567-12',
      'abcdefg-1',
      ' 1234567-1',
    ]) {
      expect(isValidBusinessId(id)).toBe(false);
    }
  });
});
