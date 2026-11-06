import { expect, it } from 'vitest';
import { isAvailableForCustomer } from './availability';

it.each([
  ['available', true, null, true],
  ['available', true, 'cust-aino', true],
  ['available', true, 'cust-lena', false],
  ['available', false, null, false],
  ['available', false, 'cust-aino', false],
  ['reserved', true, null, false],
  ['reserved', true, 'cust-aino', false],
  ['returned', true, null, false],
  ['returned', false, null, false],
] as const)(
  'checks %s, ready=%s, reservation=%s',
  (status, offerReady, reservedForCustomerId, expected) => {
    const input = { status, offerReady, reservedForCustomerId, customerId: 'cust-aino' };
    const before = { ...input };
    expect(isAvailableForCustomer(input)).toBe(expected);
    expect(input).toEqual(before);
  }
);
