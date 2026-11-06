import { expect, it } from 'vitest';
import coefficientData from '../../data/coefficient-table.json';
import vatData from '../../data/vat-rates.json';
import { coefficientTableSchema, vatRatesSchema } from '@/data/schemas';
import { comparePriceOptions } from './price-comparison';
import { findPriceGuardianSuggestion } from './price-guardian';

it('prefers the largest use saving among valid candidates, independent of band order', () => {
  const table = coefficientTableSchema.parse(coefficientData);
  // A synthetic larger band jump makes both zero and EUR 500 upfront improvements.
  table.bands[1]!.monthly_factor_by_term['36'] = 0.05;
  const input = {
    listPriceCents: 1050000,
    downPaymentCents: 150001,
    termMonths: 36,
    table,
    startDate: '2026-11-05',
    upfrontDate: '2026-11-05',
    vatRates: vatRatesSchema.parse(vatData),
  };
  const suggestion = findPriceGuardianSuggestion(input);
  const boundary = comparePriceOptions({
    ...input,
    downPaymentCents: 50000,
    termMonths: [36],
  })[0];
  if (!suggestion || !boundary?.ok) throw new Error('Both candidates must be valid');
  expect(boundary.explanation.useGrossCents).toBeLessThan(suggestion.current.useGrossCents);
  expect(boundary.explanation.ownGrossCents).toBeLessThan(suggestion.current.ownGrossCents);
  expect(suggestion.alternative.terms).toMatchObject({
    downPaymentCents: 0,
    monthlyNetCents: 28207,
  });
  expect(suggestion.alternative.useGrossCents).toBeLessThan(boundary.explanation.useGrossCents);
  expect(
    findPriceGuardianSuggestion({
      ...input,
      table: { ...table, bands: [...table.bands].reverse() },
    })
  ).toEqual(suggestion);
});
