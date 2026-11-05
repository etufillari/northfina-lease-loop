import { describe, expect, it } from 'vitest';
import type { VatRate } from '@/data/schemas';
import { calculateInvoice, resolveVat } from './invoice';
import type { LeaseTerms } from './types';

const terms: LeaseTerms = {
  contractId: 'c1',
  assetId: 'ebike-003',
  customerId: 'cust-aino',
  startDate: '2026-11-05',
  termMonths: 36,
  monthlyNetCents: 10730,
  paymentDueDays: 14,
};
const rates: [VatRate, VatRate] = [
  { rate_percent: 25.5, valid_from: '2024-09-01', valid_to: '2026-12-31' },
  { rate_percent: 26, valid_from: '2027-01-01', valid_to: null, fictional: true },
];

describe('invoice calculation', () => {
  it.each([
    [1, 2736, 13466],
    [2, 2736, 13466],
    [3, 2790, 13520],
  ])('calculates Aino period %i', (index, vat, gross) => {
    const result = calculateInvoice(terms, index, rates);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.netCents).toBe(10730);
    expect(result.value.vatCents).toBe(vat);
    expect(result.value.grossCents).toBe(gross);
    expect(result.value.currency).toBe('EUR');
  });
  it('rounds half cents up exactly once', () => {
    const result = calculateInvoice({ ...terms, monthlyNetCents: 1 }, 1, [
      { rate_percent: 50, valid_from: '2020-01-01', valid_to: null },
    ]);
    expect(result.ok && result.value.vatCents).toBe(1);
  });
  it('does not mutate terms or rules and repeats deterministically', () => {
    const input = Object.freeze({ ...terms });
    const rules = Object.freeze(rates.map((rate) => Object.freeze({ ...rate })));
    expect(calculateInvoice(input, 3, rules)).toEqual(calculateInvoice(input, 3, rules));
  });
  it('rejects invalid periods, terms and absent tax', () => {
    for (const period of [0, -1, 37, 1.5, NaN])
      expect(calculateInvoice(terms, period, rates)).toEqual({
        ok: false,
        reason: 'invalid_period',
      });
    expect(calculateInvoice({ ...terms, monthlyNetCents: -1 }, 1, rates).ok).toBe(false);
    expect(calculateInvoice(terms, 1, [])).toEqual({ ok: false, reason: 'tax_rule_missing' });
  });
});

describe('VAT resolution', () => {
  it('selects inclusive boundaries and preserves fictional metadata', () => {
    const december = resolveVat(rates, '2026-12-31');
    const january = resolveVat(rates, '2027-01-01');
    expect(december.ok && december.value.rateBps).toBe(2550);
    expect(january.ok && january.value.rateBps).toBe(2600);
    expect(january.ok && january.value.fictional).toBe(true);
  });
  it('fails safely for gaps, overlap and invalid dates', () => {
    expect(resolveVat(rates, '2020-01-01')).toEqual({ ok: false, reason: 'tax_rule_missing' });
    expect(resolveVat([...rates, rates[0]], terms.startDate)).toEqual({
      ok: false,
      reason: 'tax_rule_overlap',
    });
    expect(resolveVat(rates, '2026-02-30')).toEqual({ ok: false, reason: 'invalid_date' });
  });
  it('rejects malformed rates instead of silently choosing one', () => {
    for (const patch of [
      { rate_percent: -1 },
      { rate_percent: 25.555 },
      { rate_percent: Infinity },
      { rate_percent: 101 },
      { valid_from: 'bad' },
      { valid_to: '2020-01-01' },
      { valid_to: 'bad' },
    ]) {
      expect(resolveVat([{ ...rates[0], ...patch }], terms.startDate)).toEqual({
        ok: false,
        reason: 'invalid_tax_rule',
      });
    }
  });
});
