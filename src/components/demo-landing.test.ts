import { describe, expect, it } from 'vitest';
import { landingAfterSwitch } from './demo-landing';

const customer = { staff: false, cartCount: 0 };

describe('landingAfterSwitch', () => {
  it("leaves the previous persona's application or lease, which the new one can't see", () => {
    expect(landingAfterSwitch('/en/applications/cmw4xj2it00001cruw2m5y131', customer)).toBe(
      '/en/account/leases'
    );
    expect(landingAfterSwitch('/fi/account/leases/abc/buyout', customer)).toBe(
      '/fi/account/leases'
    );
    expect(landingAfterSwitch('/en/account/leases/abc', { ...customer, cartCount: 1 })).toBe(
      '/en/cart'
    );
  });

  it('leaves staff pages only when the new persona is not staff', () => {
    expect(landingAfterSwitch('/en/staff/returns/r1', customer)).toBe('/en/account/leases');
    expect(landingAfterSwitch('/en/staff', { staff: true, cartCount: 0 })).toBeNull();
  });

  it('stays on pages that work for anyone', () => {
    for (const path of ['/en', '/en/products/ebike-003', '/en/cart', '/en/account/leases', '/'])
      expect(landingAfterSwitch(path, customer)).toBeNull();
  });
});
