import { describe, expect, it } from 'vitest';
import { ADMIN_ADDRESS, customerAddress, notificationAddresses } from './notifications';

describe('notificationAddresses', () => {
  it('gives a customer their own address only', () => {
    const aino = { id: 'cust-aino', role: 'client', kind: 'customer' } as const;
    expect(notificationAddresses(aino)).toEqual([customerAddress('cust-aino')]);
  });

  it('gives an admin the admin address', () => {
    const admin = { id: 'staff-admin', role: 'admin', kind: 'staff' } as const;
    expect(notificationAddresses(admin)).toEqual([ADMIN_ADDRESS]);
  });

  it('gives a dealer nothing', () => {
    const dealer = { id: 'staff-dealer', role: 'dealer', kind: 'staff' } as const;
    expect(notificationAddresses(dealer)).toEqual([]);
  });

  it('gives a signatory nothing, even though they act for a company', () => {
    const ceo = { id: 'sign-norvi-ceo', role: 'signatory', kind: 'signatory' } as const;
    expect(notificationAddresses(ceo)).toEqual([]);
  });
});
