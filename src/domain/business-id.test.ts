import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { isValidBusinessId } from './business-id';

// Tests run against the real data pack, so they also catch a changed customer.
let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});

describe('isValidBusinessId', () => {
  it('accepts every business ID in the data pack except the broken one', () => {
    const results = customers.flatMap((customer) =>
      customer.type === 'consumer'
        ? []
        : [{ id: customer.id, valid: isValidBusinessId(customer.business_id) }]
    );
    expect(results).toEqual([
      { id: 'cust-pekka', valid: true },
      { id: 'cust-kettukoodi', valid: true },
      { id: 'cust-haapala', valid: true },
      { id: 'cust-norvi', valid: true },
      { id: 'cust-broken-id', valid: false },
    ]);
  });

  it('accepts the correct digit for the broken ID', () => {
    expect(isValidBusinessId('1234567-8')).toBe(false);
    expect(isValidBusinessId('1234567-1')).toBe(true);
  });

  it('uses check digit 0 when the remainder is 0', () => {
    expect(isValidBusinessId('1000002-0')).toBe(true);
    expect(isValidBusinessId('1000002-1')).toBe(false);
  });

  it('uses 11 minus the remainder otherwise', () => {
    expect(isValidBusinessId('1000003-9')).toBe(true);
    expect(isValidBusinessId('1000003-8')).toBe(false);
  });

  it('rejects every check digit when the remainder is 1', () => {
    for (let digit = 0; digit <= 9; digit++) {
      expect(isValidBusinessId(`1000008-${digit}`)).toBe(false);
    }
  });

  it.each([
    ['nothing', ''],
    ['no hyphen', '30124565'],
    ['too few digits', '301245-5'],
    ['too many digits', '30124567-5'],
    ['two check digits', '3012456-55'],
    ['letters', '301245A-5'],
    ['spaces around it', ' 3012456-5 '],
  ])('rejects %s', (_name, value) => {
    expect(isValidBusinessId(value)).toBe(false);
  });
});
