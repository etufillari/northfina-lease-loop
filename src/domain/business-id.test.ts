import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { isValidFinnishBusinessId, validateFinnishBusinessId } from './business-id';

let customers: Customer[];
beforeAll(async () => {
  customers = await loadCustomers();
});

describe('validateFinnishBusinessId', () => {
  it('accepts a correct check digit', () => {
    // 1×7+2×9+3×10+4×5+5×8+6×4+7×2 = 153, 153 mod 11 = 10, check digit 11−10 = 1.
    expect(validateFinnishBusinessId('1234567-1')).toEqual({ ok: true });
  });

  it('rejects the data pack’s broken ID 1234567-8', () => {
    expect(validateFinnishBusinessId('1234567-8')).toEqual({
      ok: false,
      reason: 'wrong_check_digit',
    });
  });

  it('accepts a remainder-0 ID with check digit 0', () => {
    expect(validateFinnishBusinessId('0000000-0')).toEqual({ ok: true });
  });

  it('rejects wrong formats', () => {
    expect(validateFinnishBusinessId('123456-1')).toEqual({ ok: false, reason: 'bad_format' });
    expect(validateFinnishBusinessId('1234567/6')).toEqual({ ok: false, reason: 'bad_format' });
    expect(validateFinnishBusinessId('')).toEqual({ ok: false, reason: 'bad_format' });
  });

  it('validates every data-pack business except cust-broken-id', () => {
    const businesses = customers.filter((c) => c.type !== 'consumer');
    expect(businesses.length).toBeGreaterThan(0);
    for (const customer of businesses) {
      expect(isValidFinnishBusinessId(customer.business_id)).toBe(customer.id !== 'cust-broken-id');
    }
  });
});
