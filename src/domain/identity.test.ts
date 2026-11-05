import { describe, expect, it } from 'vitest';
import type { Customer, Staff } from '@/data/schemas';
import {
  can,
  findIdentity,
  identityId,
  identityName,
  identitySummary,
  isRole,
  listIdentities,
  PERMISSIONS,
  type Permission,
  type Role,
} from './identity';

const aino: Customer = {
  id: 'cust-aino',
  type: 'consumer',
  name: 'Aino Virtanen',
  country: 'FI',
  city: 'Helsinki',
  email: 'aino.virtanen@example.com',
  is_pep: false,
  story: 'The happy path.',
  birth_date: '1997-04-12',
  employment: 'employed',
  monthly_net_income_cents: 320_000,
};

const dealer: Staff = {
  id: 'staff-dealer',
  name: 'Dealer desk',
  role: 'dealer',
  story: 'Handles returns and asset status.',
};

const admin: Staff = {
  id: 'staff-admin',
  name: 'Northfina admin',
  role: 'admin',
  story: 'Decides manual review.',
};

describe('listIdentities', () => {
  it('turns every customer into a client and every staff member into their own role', () => {
    const identities = listIdentities([aino], [dealer, admin]);
    expect(identities).toEqual([
      { kind: 'customer', role: 'client', customer: aino },
      { kind: 'staff', role: 'dealer', staff: dealer },
      { kind: 'staff', role: 'admin', staff: admin },
    ]);
  });

  it('returns an empty list for no customers and no staff', () => {
    expect(listIdentities([], [])).toEqual([]);
  });
});

describe('identityId and identityName', () => {
  it('reads the id and name from the customer for a customer identity', () => {
    const identity = listIdentities([aino], [])[0]!;
    expect(identityId(identity)).toBe('cust-aino');
    expect(identityName(identity)).toBe('Aino Virtanen');
  });

  it('reads the id and name from the staff record for a staff identity', () => {
    const identity = listIdentities([], [dealer])[0]!;
    expect(identityId(identity)).toBe('staff-dealer');
    expect(identityName(identity)).toBe('Dealer desk');
  });
});

describe('identitySummary', () => {
  it('flattens a customer identity to a plain id, name, role and kind', () => {
    const identity = listIdentities([aino], [])[0]!;
    expect(identitySummary(identity)).toEqual({
      id: 'cust-aino',
      name: 'Aino Virtanen',
      role: 'client',
      kind: 'customer',
    });
  });

  it('flattens a staff identity the same way', () => {
    const identity = listIdentities([], [dealer])[0]!;
    expect(identitySummary(identity)).toEqual({
      id: 'staff-dealer',
      name: 'Dealer desk',
      role: 'dealer',
      kind: 'staff',
    });
  });
});

describe('findIdentity', () => {
  it('finds a customer by id', () => {
    expect(findIdentity([aino], [dealer], 'cust-aino')).toEqual({
      kind: 'customer',
      role: 'client',
      customer: aino,
    });
  });

  it('finds a staff member by id', () => {
    expect(findIdentity([aino], [dealer], 'staff-dealer')).toEqual({
      kind: 'staff',
      role: 'dealer',
      staff: dealer,
    });
  });

  it('returns undefined for an id that matches nobody', () => {
    expect(findIdentity([aino], [dealer], 'nope')).toBeUndefined();
  });
});

describe('can', () => {
  it('lets a client submit, sign and view their own contracts, but nothing staff-only', () => {
    expect(can('client', 'application.submit')).toBe(true);
    expect(can('client', 'contract.sign')).toBe(true);
    expect(can('client', 'contract.view_own')).toBe(true);
    expect(can('client', 'contract.view_all')).toBe(false);
    expect(can('client', 'asset.change_status')).toBe(false);
    expect(can('client', 'application.decide_manual_review')).toBe(false);
  });

  it('lets a dealer run the operational side but not decide manual review', () => {
    expect(can('dealer', 'contract.view_all')).toBe(true);
    expect(can('dealer', 'asset.change_status')).toBe(true);
    expect(can('dealer', 'item.view_history')).toBe(true);
    expect(can('dealer', 'second_life.refurbish')).toBe(true);
    expect(can('dealer', 'audit_log.view')).toBe(true);
    expect(can('dealer', 'application.decide_manual_review')).toBe(false);
    expect(can('dealer', 'contract.sign')).toBe(false);
  });

  it('gives admin every dealer permission, plus manual review', () => {
    const dealerPermissions = PERMISSIONS.filter((permission) => can('dealer', permission));
    for (const permission of dealerPermissions) {
      expect(can('admin', permission), `admin should also have "${permission}"`).toBe(true);
    }
    expect(can('admin', 'application.decide_manual_review')).toBe(true);
  });

  it('has no permission that applies to nobody', () => {
    const roles: Role[] = ['client', 'dealer', 'admin'];
    for (const permission of PERMISSIONS) {
      expect(
        roles.some((role) => can(role, permission)),
        `"${permission}" grants nobody`
      ).toBe(true);
    }
  });

  it('is exhaustive: every Permission is a real string in the list', () => {
    const permission: Permission = 'audit_log.view';
    expect(PERMISSIONS).toContain(permission);
  });
});

describe('isRole', () => {
  it('accepts the three known roles', () => {
    expect(isRole('client')).toBe(true);
    expect(isRole('dealer')).toBe(true);
    expect(isRole('admin')).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isRole('superadmin')).toBe(false);
    expect(isRole('')).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});
