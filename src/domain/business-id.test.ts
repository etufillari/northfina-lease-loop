import { describe, expect, it } from 'vitest';
import { isFinnishBusinessId } from './business-id';

describe('Finnish business ID checksum', () => {
  it.each([
    '3012456-5',
    '3187650-7',
    '2876543-5',
    '3299871-7',
    '0000019-0',
    '1234567-1',
    // A single nonzero digit isolates each positional weight from left to right.
    '1000000-4',
    '0100000-2',
    '0010000-1',
    '0001000-6',
    '0000100-3',
    '0000010-7',
    '0000001-9',
  ])('accepts a checksum-valid ID: %s', (value) => {
    expect(isFinnishBusinessId(value)).toBe(true);
  });

  it.each([
    '1234567-8',
    '3012456-0',
    '0000019-1',
    '30124565',
    '301245-5',
    '03012456-5',
    '3012456-55',
    ' 3012456-5',
    '3012456-5 ',
    '3012456-5\n',
    '3012456-5\r\n',
    '3012456-5\t',
    '3012456–5',
    '3012456−5',
    'abcdefg-5',
    '３０１２４５６-５',
    '٣٠١٢٤٥٦-٥',
    'FI30124565',
    '',
    '\n',
  ])('rejects malformed IDs and incorrect check digits: %s', (value) => {
    expect(isFinnishBusinessId(value)).toBe(false);
  });

  it.each(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])(
    'rejects remainder one regardless of the check digit: %s',
    (digit) => {
      // 6 × 2 = 12; remainder 1 has no valid control digit.
      expect(isFinnishBusinessId(`0000006-${digit}`)).toBe(false);
    }
  );
});
