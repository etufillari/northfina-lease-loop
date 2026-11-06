import { describe, expect, it } from 'vitest';
import { assetStatusSchema } from '@/data/schemas';
import type { Asset } from '@/data/schemas';
import { assetForViewer, canChangeStatusByHand, isHeldForSomeoneElse } from './status';

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

describe('assetForViewer', () => {
  const asset: Asset = {
    id: 'ebike-003',
    category: 'e_bike',
    make: 'Nordvolt',
    model: 'Trail 500',
    model_year: 2026,
    serial_number: 'SN-1',
    condition: 'good',
    usage: { unit: 'km', value: 8_000 },
    previous_lives: 1,
    status: 'available',
  };
  const held: Asset = { ...asset, reserved_for: 'cust-wait-02' };

  it('leaves an item with no hold as it is', () => {
    expect(assetForViewer(asset, 'cust-aino')).toEqual(asset);
  });

  it('shows a held item as reserved to everyone else, and to the logged out', () => {
    expect(assetForViewer(held, 'cust-aino').status).toBe('reserved');
    expect(assetForViewer(held, undefined).status).toBe('reserved');
  });

  it('marks it as theirs for the person it is held for', () => {
    expect(assetForViewer(held, 'cust-wait-02')).toMatchObject({
      status: 'available',
      held_for_you: true,
    });
  });

  it('does not mark it for anyone else', () => {
    expect(assetForViewer(held, 'cust-aino')).not.toHaveProperty('held_for_you');
    expect(assetForViewer(asset, 'cust-wait-02')).not.toHaveProperty('held_for_you');
  });

  it('never reveals who it is held for', () => {
    expect(assetForViewer(held, 'cust-aino')).not.toHaveProperty('reserved_for');
    expect(assetForViewer(held, 'cust-wait-02')).not.toHaveProperty('reserved_for');
  });

  it('keeps a returned item returned while it waits for the dealer', () => {
    expect(assetForViewer({ ...held, status: 'returned' }, 'cust-aino').status).toBe('returned');
  });
});
