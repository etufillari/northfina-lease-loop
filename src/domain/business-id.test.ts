import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { isValidBusinessId } from './business-id';

let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});

describe('isValidBusinessId', () => {
  it('accepts every business ID in the data pack except the deliberately broken one', () => {
    for (const c of customers) {
      if (c.type === 'consumer') continue;
      expect(isValidBusinessId(c.business_id), c.id).toBe(c.id !== 'cust-broken-id');
    }
  });

  it('rejects a wrong check digit', () => {
    expect(isValidBusinessId('3012456-5')).toBe(true);
    expect(isValidBusinessId('3012456-4')).toBe(false);
    expect(isValidBusinessId('1234567-8')).toBe(false);
  });

  it('accepts check digit 0 when the weighted sum is a multiple of 11', () => {
    expect(isValidBusinessId('0000000-0')).toBe(true);
    expect(isValidBusinessId('0000000-1')).toBe(false);
  });

  it('never accepts a number whose remainder is 1', () => {
    // 0000006: 2 * 6 = 12, and 12 mod 11 = 1, so no check digit can make it valid.
    for (let check = 0; check <= 9; check++) {
      expect(isValidBusinessId(`0000006-${check}`)).toBe(false);
    }
  });

  it('ignores surrounding whitespace but rejects other malformed input', () => {
    expect(isValidBusinessId(' 3012456-5 ')).toBe(true);
    for (const bad of ['', '30124565', '3012456-', '301245-65', '3012456-55', 'abcdefg-5']) {
      expect(isValidBusinessId(bad), bad).toBe(false);
    }
  });
});
