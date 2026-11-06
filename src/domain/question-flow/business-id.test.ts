import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { businessIdCheckDigit, isValidBusinessId } from './business-id';

let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});

describe('businessIdCheckDigit (Y-tunnus: weights 7 9 10 5 8 4 2, mod 11)', () => {
  it('computes the digit for the trap id 1234567: 153 mod 11 = 10, so 1', () => {
    expect(businessIdCheckDigit('1234567')).toBe(1);
  });

  it('a remainder of 0 gives check digit 0', () => {
    // 0000000 → sum 0 → remainder 0
    expect(businessIdCheckDigit('0000000')).toBe(0);
  });

  it('a remainder of 1 has no valid check digit', () => {
    // 0000006 → 6 · 2 = 12, 12 mod 11 = 1
    expect(businessIdCheckDigit('0000006')).toBeNull();
  });
});

describe('isValidBusinessId', () => {
  it('the trap: Typo Trading Oy 1234567-8 has a wrong check digit', () => {
    expect(isValidBusinessId('1234567-8')).toBe(false);
    expect(isValidBusinessId('1234567-1')).toBe(true);
  });

  it('every other business id in customers.json is valid', () => {
    const withId = customers.filter(
      (c): c is Extract<Customer, { business_id: string }> => 'business_id' in c
    );
    const invalid = withId.filter((c) => !isValidBusinessId(c.business_id)).map((c) => c.id);
    expect(invalid).toEqual(['cust-broken-id']);
  });

  it('rejects the wrong shape', () => {
    for (const bad of ['', '1234567', '12345678', '123456-1', '1234567-12', 'abcdefg-1']) {
      expect(isValidBusinessId(bad)).toBe(false);
    }
  });

  it('tolerates spaces around the id', () => {
    expect(isValidBusinessId(' 1234567-1 ')).toBe(true);
  });
});
