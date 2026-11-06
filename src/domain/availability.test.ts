import { describe, expect, it } from 'vitest';
import { canBeLeasedBy } from './availability';

describe('canBeLeasedBy', () => {
  it('lets anyone lease an available item, guests included', () => {
    expect(canBeLeasedBy({ status: 'available', reservedFor: null }, null)).toBe(true);
    expect(canBeLeasedBy({ status: 'available', reservedFor: null }, 'cust-aino')).toBe(true);
  });

  it('lets only the customer it is held for lease a reserved item', () => {
    const held = { status: 'reserved' as const, reservedFor: 'cust-lena' };
    expect(canBeLeasedBy(held, 'cust-lena')).toBe(true);
    expect(canBeLeasedBy(held, 'cust-aino')).toBe(false);
    expect(canBeLeasedBy(held, null)).toBe(false);
  });

  it('keeps the data pack’s own reservations (held for nobody we know) unleasable', () => {
    expect(canBeLeasedBy({ status: 'reserved', reservedFor: null }, null)).toBe(false);
  });

  it('never lets leased, returned or sold items be leased', () => {
    for (const status of ['leased', 'returned', 'sold'] as const) {
      expect(canBeLeasedBy({ status, reservedFor: 'cust-lena' }, 'cust-lena')).toBe(false);
    }
  });
});
