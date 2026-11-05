import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { makeQuote, type Quote } from './quote';
import { quoteStatus, quoteToSign } from './signing';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

function quoteFor(assetId: string, quoteDate: string): Quote {
  const result = makeQuote(priceLists, table, {
    assetId,
    quoteDate,
    termMonths: 36,
    downPaymentCents: 0,
  });
  if (!result.ok) throw new Error(`test setup: ${result.reason}`);
  return result.quote;
}

describe('quoteStatus', () => {
  // Quoted Thu 5 Nov 2026: valid until Thu 12 Nov (5 + QUOTE_VALID_DAYS 7), inclusive.
  const quote = { quoteDate: '2026-11-05', validUntil: '2026-11-12' };

  it('is open from the quote day through its last valid day (day 7)', () => {
    expect(quoteStatus(quote, '2026-11-05', false)).toBe('open');
    expect(quoteStatus(quote, '2026-11-12', false)).toBe('open');
  });

  it('expires on day 8', () => {
    expect(quoteStatus(quote, '2026-11-13', false)).toBe('expired');
  });

  it('is not valid yet before its quote day (a demo date moved back)', () => {
    expect(quoteStatus(quote, '2026-11-04', false)).toBe('not_yet_valid');
  });

  it('reports a quote that was already signed as used, whatever the date', () => {
    expect(quoteStatus(quote, '2026-11-06', true)).toBe('used');
    expect(quoteStatus(quote, '2026-11-20', true)).toBe('used');
  });
});

describe('quoteToSign (card 2: laptop-004 quoted Thu on v1, signed Fri on v2)', () => {
  // Thu v1: 349 000 × 0.027584 = 9 626.8 → 9 627. Fri v2: 321 100 × 0.027584 = 8 857.2 → 8 857.
  const sign = (signDate: string, choice: Parameters<typeof quoteToSign>[4]) =>
    quoteToSign(priceLists, table, quoteFor('laptop-004', '2026-11-05'), signDate, choice);

  it('asks the customer to choose when today’s rent is lower, and signs nothing', () => {
    expect(sign('2026-11-06', { shownMonthlyNetRentCents: 9_627 })).toEqual({
      ok: false,
      reason: 'price_choice_required',
      quotedMonthlyNetRentCents: 9_627,
      todaysMonthlyNetRentCents: 8_857,
      todaysPriceListVersion: 2,
      savingPerMonthCents: 770, // 9 627 − 8 857
    });
  });

  it('keeps the v1 quote when the customer chooses it', () => {
    const result = sign('2026-11-06', {
      priceChoice: 'keep_quote',
      shownMonthlyNetRentCents: 9_627,
    });
    expect(result).toMatchObject({
      ok: true,
      priceChoice: 'keep_quote',
      check: { kind: 'cheaper_today', savingPerMonthCents: 770 },
      quote: { quoteDate: '2026-11-05', priceListVersion: 1, monthlyNetRentCents: 9_627 },
    });
  });

  it('signs today’s v2 quote when the customer chooses it', () => {
    const result = sign('2026-11-06', {
      priceChoice: 'todays_price',
      shownMonthlyNetRentCents: 8_857,
    });
    expect(result).toMatchObject({
      ok: true,
      priceChoice: 'todays_price',
      quote: {
        quoteDate: '2026-11-06',
        validUntil: '2026-11-13',
        priceListVersion: 2,
        listPriceCents: 321_100,
        monthlyNetRentCents: 8_857,
      },
    });
  });

  it('refuses when the price the customer saw is not the one that would lock', () => {
    // The browser showed 9 627 but asked for today's price (8 857): never lock an unseen price.
    expect(
      sign('2026-11-06', { priceChoice: 'todays_price', shownMonthlyNetRentCents: 9_627 })
    ).toEqual({ ok: false, reason: 'price_changed' });
    expect(
      sign('2026-11-06', { priceChoice: 'keep_quote', shownMonthlyNetRentCents: 8_857 })
    ).toEqual({ ok: false, reason: 'price_changed' });
  });

  it('signs the quote as it is on the quote day, with no choice to make', () => {
    expect(sign('2026-11-05', { shownMonthlyNetRentCents: 9_627 })).toMatchObject({
      ok: true,
      priceChoice: null,
      check: { kind: 'unchanged' },
      quote: { priceListVersion: 1, monthlyNetRentCents: 9_627 },
    });
  });

  it('refuses "today’s price" when there is no cheaper offer any more', () => {
    // On the quote day there is nothing cheaper: the offer the browser showed is stale.
    expect(
      sign('2026-11-05', { priceChoice: 'todays_price', shownMonthlyNetRentCents: 9_627 })
    ).toEqual({ ok: false, reason: 'price_changed' });
  });

  it('signs through day 7 and refuses on day 8', () => {
    // Fri 13 Nov would also be cheaper (v2), but the quote has expired first.
    expect(
      sign('2026-11-12', { priceChoice: 'keep_quote', shownMonthlyNetRentCents: 9_627 }).ok
    ).toBe(true);
    expect(
      sign('2026-11-13', { priceChoice: 'keep_quote', shownMonthlyNetRentCents: 9_627 })
    ).toEqual({ ok: false, reason: 'quote_expired' });
  });

  it('refuses before the quote day', () => {
    expect(sign('2026-11-04', { shownMonthlyNetRentCents: 9_627 })).toEqual({
      ok: false,
      reason: 'signed_before_quote',
    });
  });
});

describe('quoteToSign when today is dearer', () => {
  it('signs the quote, which protects the customer (ebike-003, +5 % on v2)', () => {
    // Thu v1 389 000 × 0.027584 = 10 730.2 → 10 730. Fri v2 408 400 × 0.027584 = 11 265.3 → 11 265.
    const result = quoteToSign(
      priceLists,
      table,
      quoteFor('ebike-003', '2026-11-05'),
      '2026-11-06',
      { shownMonthlyNetRentCents: 10_730 }
    );
    expect(result).toMatchObject({
      ok: true,
      priceChoice: null,
      check: { kind: 'dearer_today', extraPerMonthCents: 535 }, // 11 265 − 10 730
      quote: { priceListVersion: 1, monthlyNetRentCents: 10_730 },
    });
  });
});
