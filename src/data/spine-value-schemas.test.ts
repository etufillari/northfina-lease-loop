import { expect, it } from 'vitest';
import { z } from 'zod';
import { priceTermsSchema, storageCentsSchema } from './spine-value-schemas';

const terms = {
  listPriceCents: 389000,
  downPaymentCents: 0,
  financedCents: 389000,
  termMonths: 36,
  coefficientTableId: 'ct-2026-1',
  coefficientTableVersion: 1,
  band: 'B',
  factorMillionths: 27584,
  monthlyNetCents: 10730,
  buyoutNetCents: 58350,
  totalRentNetCents: 386280,
};
it('shares fields without changing strict server vs stripping draft policies', () => {
  expect(priceTermsSchema.safeParse({ ...terms, injected: true }).success).toBe(false);
  expect(z.object(priceTermsSchema.shape).parse({ ...terms, injected: true })).toEqual(terms);
  expect(priceTermsSchema.safeParse({ ...terms, monthlyNetCents: '10730' }).success).toBe(false);
});

it.each([0, 1, 2_147_483_647])('accepts storable integer cents: %s', (value) => {
  expect(storageCentsSchema.parse(value)).toBe(value);
});

it.each([-1, 0.5, 2_147_483_648, Number.MAX_SAFE_INTEGER, NaN, Infinity, '10730', true, null])(
  'rejects out-of-range or nonnumeric cents: %s',
  (value) => {
    expect(storageCentsSchema.safeParse(value).success).toBe(false);
  }
);

it('round-trips a complete price snapshot without changing its fields', () => {
  expect(priceTermsSchema.parse(terms)).toEqual(terms);
});

it.each([
  'listPriceCents',
  'downPaymentCents',
  'financedCents',
  'monthlyNetCents',
  'buyoutNetCents',
  'totalRentNetCents',
] as const)('requires valid storage cents in %s', (field) => {
  expect(priceTermsSchema.safeParse({ ...terms, [field]: 2_147_483_648 }).success).toBe(false);
  expect(priceTermsSchema.safeParse({ ...terms, [field]: undefined }).success).toBe(false);
});

it.each(['termMonths', 'coefficientTableVersion', 'factorMillionths'] as const)(
  'requires a positive integer for %s',
  (field) => {
    for (const value of [0, -1, 0.5, '1']) {
      expect(priceTermsSchema.safeParse({ ...terms, [field]: value }).success).toBe(false);
    }
  }
);
