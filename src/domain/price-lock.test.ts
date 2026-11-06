import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import { applicationCart, type ApplicationCatalogue } from './application-cart';
import { priceChanges, quoteStillValid, QUOTE_VALID_DAYS, sameSelection } from './price-lock';

let thursday: ApplicationCatalogue;
let friday: ApplicationCatalogue;
const laptop = { id: 'laptop-004', name: 'Saimaa Systems Studio 15', category: 'laptop' as const };
const selection = [{ id: 'laptop-004', termMonths: 36, downPaymentCents: 0 }];
beforeAll(async () => {
  const [table, vat] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
  const base = { table, rates: vat.rates };
  // Scenario card 2: price list v1 on Thursday, v2 (laptops −8 %) from Friday.
  thursday = {
    ...base,
    today: '2026-11-05',
    options: [{ ...laptop, available: true, priceCents: 349000, priceListVersion: 1 }],
  };
  friday = {
    ...base,
    today: '2026-11-06',
    options: [{ ...laptop, available: true, priceCents: 321100, priceListVersion: 2 }],
  };
});

describe('quoteStillValid', () => {
  it(`is valid from the quote day for ${QUOTE_VALID_DAYS} days, across month ends`, () => {
    expect(quoteStillValid('2026-11-05', '2026-11-05')).toBe(true);
    expect(quoteStillValid('2026-11-05', '2026-11-12')).toBe(true);
    expect(quoteStillValid('2026-11-05', '2026-11-13')).toBe(false);
    expect(quoteStillValid('2026-12-28', '2027-01-04')).toBe(true);
  });
  it('is never valid before the quote day or for invalid dates', () => {
    expect(quoteStillValid('2026-11-05', '2026-11-04')).toBe(false);
    expect(quoteStillValid('2026-02-30', '2026-03-01')).toBe(false);
  });
});

describe('sameSelection', () => {
  it('compares items, terms and down payments, not prices', () => {
    const quoted = applicationCart(thursday, selection)!.items;
    const today = applicationCart(friday, selection)!.items;
    expect(sameSelection(quoted, today)).toBe(true);
    expect(sameSelection(quoted, [{ ...selection[0]!, termMonths: 24 }])).toBe(false);
    expect(sameSelection(quoted, [{ ...selection[0]!, downPaymentCents: 1 }])).toBe(false);
    expect(sameSelection(quoted, [])).toBe(false);
  });
});

describe('priceChanges (card 2)', () => {
  it('shows the quoted Thursday price next to the Friday price that signing locks', () => {
    const quoted = applicationCart(thursday, selection)!.items;
    const today = applicationCart(friday, selection)!.items;
    const [change] = priceChanges(quoted, today);
    expect(change).toMatchObject({
      id: 'laptop-004',
      quotedPriceCents: 349000,
      quotedPriceListVersion: 1,
      priceCents: 321100,
      priceListVersion: 2,
      differenceCents: -27900,
    });
    expect(change!.monthlyTotalCents).toBeLessThan(change!.quotedMonthlyTotalCents);
  });
  it('is empty when nothing changed', () => {
    const quoted = applicationCart(thursday, selection)!.items;
    expect(priceChanges(quoted, quoted)).toEqual([]);
  });
  it('also reports a price that went up', () => {
    const quoted = applicationCart(friday, selection)!.items;
    const today = applicationCart(thursday, selection)!.items;
    expect(priceChanges(quoted, today)[0]!.differenceCents).toBe(27900);
  });
});
