import { describe, expect, it } from 'vitest';
import { assetStatusSchema } from '@/data/schemas';
import { canChangeStatusByHand, isHeldForSomeoneElse } from './status';

describe('canChangeStatusByHand', () => {
  it.each([
    ['available', 'reserved'],
    ['reserved', 'available'],
    ['returned', 'available'],
    ['available', 'returned'],
    ['available', 'available'],
  ] as const)('allows %s to %s', (from, to) => {
    expect(canChangeStatusByHand(from, to)).toBe(true);
  });

  it('never lets a leased or sold asset change by hand', () => {
    for (const to of assetStatusSchema.options) {
      expect(canChangeStatusByHand('leased', to)).toBe(false);
      expect(canChangeStatusByHand('sold', to)).toBe(false);
    }
  });

  it('never lets a person set leased or sold', () => {
    for (const from of assetStatusSchema.options) {
      expect(canChangeStatusByHand(from, 'leased')).toBe(false);
      expect(canChangeStatusByHand(from, 'sold')).toBe(false);
    }
  });
});

describe('isHeldForSomeoneElse', () => {
  it('leaves an item with no hold open to everyone', () => {
    expect(isHeldForSomeoneElse(null, 'cust-aino')).toBe(false);
    expect(isHeldForSomeoneElse(undefined, undefined)).toBe(false);
  });

  it('lets the person it is held for through', () => {
    expect(isHeldForSomeoneElse('cust-aino', 'cust-aino')).toBe(false);
  });

  it('stops everyone else, and the logged out', () => {
    expect(isHeldForSomeoneElse('cust-aino', 'cust-lena')).toBe(true);
    expect(isHeldForSomeoneElse('cust-aino', undefined)).toBe(true);
  });
});
