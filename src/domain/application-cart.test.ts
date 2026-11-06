import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import {
  applicationCart,
  sameApplicationItems,
  type ApplicationCatalogue,
} from './application-cart';
let data: ApplicationCatalogue;
beforeAll(async () => {
  data = {
    today: '2026-11-05',
    table: await loadCoefficientTable(),
    rates: (await loadVatRates()).rates,
    options: [
      {
        id: 'one',
        name: 'Bike',
        category: 'e_bike',
        available: true,
        priceCents: 389000,
        priceListVersion: 1,
      },
      {
        id: 'two',
        name: 'Laptop',
        category: 'laptop',
        available: true,
        priceCents: 389000,
        priceListVersion: 1,
      },
    ],
  };
});
const selections = [
  { id: 'one', termMonths: 36, downPaymentCents: 0 },
  { id: 'two', termMonths: 24, downPaymentCents: 0 },
];
describe('application cart snapshot', () => {
  it('combines financing, monthly rent and categories across the whole cart', () => {
    const result = applicationCart(data, selections)!;
    expect(result.context.financedCents).toBe(778000);
    expect(result.context.monthlyTotalCents).toBe(
      result.items.reduce((sum, item) => sum + item.monthlyTotalCents, 0)
    );
    expect(result.context.categories).toEqual(['e_bike', 'laptop']);
    expect(result.context.termMonths).toBe(36);
  });
  it('rejects empty, duplicate, oversized, unknown, unavailable and invalid selections', () => {
    for (const items of [
      [],
      [...selections, selections[0]!],
      Array(11).fill(selections[0]),
      [{ ...selections[0]!, id: 'missing' }],
      [{ ...selections[0]!, termMonths: 61 }],
      [{ ...selections[0]!, downPaymentCents: -1 }],
    ])
      expect(applicationCart(data, items)).toBeNull();
    expect(
      applicationCart(
        { ...data, options: data.options.map((item) => ({ ...item, available: false })) },
        selections
      )
    ).toBeNull();
  });
  it('matches reordered carts but rejects changed prices, terms or down payments', () => {
    const original = applicationCart(data, selections)!.items;
    expect(sameApplicationItems(original, [...original].reverse())).toBe(true);
    for (const change of [
      { termMonths: 48 },
      { downPaymentCents: 100 },
      { priceListVersion: 2 },
      { monthlyTotalCents: 1 },
      { priceCents: 1 },
    ]) {
      expect(sameApplicationItems(original, [{ ...original[0]!, ...change }, original[1]!])).toBe(
        false
      );
    }
    expect(sameApplicationItems(original, original.slice(0, 1))).toBe(false);
  });
});
