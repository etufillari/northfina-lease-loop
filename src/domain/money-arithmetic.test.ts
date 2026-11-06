import { describe, expect, it } from 'vitest';
import { decimalToScaled, multiplyRatio, parseCents } from './money-arithmetic';

describe('exact monetary boundaries', () => {
  it.each([
    [0.027584, 6, 27584],
    [25.5, 2, 2550],
    [15, 2, 1500],
    [0, 0, 0],
    [0.000001, 6, 1],
    [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER],
  ])('scales %s to %s decimal places without rounding', (value, places, expected) => {
    expect(decimalToScaled(value, places)).toBe(expected);
  });

  it.each([
    [0.1234567, 6],
    [-1, 2],
    [Number.NaN, 2],
    [Number.POSITIVE_INFINITY, 2],
    [1, -1],
    [1, 7],
    [1, 1.5],
    [1, Number.NaN],
    [Number.MAX_SAFE_INTEGER, 1],
  ])('rejects unsupported table value %s / precision %s', (value, places) => {
    expect(() => decimalToScaled(value, places)).toThrow(RangeError);
  });

  it.each([
    [389000, 27584, 1000000, 10730],
    [10730, 2550, 10000, 2736],
    [10730, 2600, 10000, 2790],
    [1, 1, 2, 1],
    [1, 1, 3, 0],
    [2, 1, 3, 1],
    [0, 1, 2, 0],
    [100, 0, 1, 0],
    [Number.MAX_SAFE_INTEGER, 1, 1, Number.MAX_SAFE_INTEGER],
    [Number.MAX_SAFE_INTEGER, 3, 3, Number.MAX_SAFE_INTEGER],
  ])('rounds %s × %s / %s to %s', (cents, numerator, denominator, expected) => {
    expect(multiplyRatio(cents, numerator, denominator)).toBe(expected);
  });

  it.each([
    [1.2, 1, 2],
    [-1, 1, 2],
    [1, 1, 0],
    [1, -1, 2],
    [1, 0.5, 2],
    [1, 1, -2],
    [1, 1, 0.5],
    [Number.NaN, 1, 2],
    [1, Number.POSITIVE_INFINITY, 2],
    [1, 1, Number.NaN],
    [Number.MAX_SAFE_INTEGER + 1, 1, 2],
    [Number.MAX_SAFE_INTEGER, 2, 1],
  ])('rejects invalid or overflowing ratio %s × %s / %s', (cents, numerator, denominator) => {
    expect(() => multiplyRatio(cents, numerator, denominator)).toThrow(RangeError);
  });

  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.3', 1230],
    ['12,34', 1234],
    [' 0.01 ', 1],
    ['0,00', 0],
    // The highest amount accepted by the API and Prisma Int storage contract.
    ['21474836.47', 2_147_483_647],
  ])('parses %s as cents', (text, expected) => {
    expect(parseCents(text)).toEqual({ ok: true, cents: expected });
  });

  it.each([
    '',
    '   ',
    '-1',
    '1.001',
    '1e3',
    '1 000',
    'Infinity',
    '9007199254740992',
    '90071992547409.92',
    '1,2.3',
    '12.',
    '000000000000000000000',
    // Beyond the signed-32-bit storage cap, one cent and far beyond: field-level
    // invalid_money, never a mysterious server VALIDATION_ERROR.
    '21474836.48',
    '999999999',
    '90071992547409.91',
  ])('refuses ambiguous or unsafe money: %s', (text) => {
    expect(parseCents(text)).toEqual({ ok: false, reason: 'invalid_money' });
  });
});
