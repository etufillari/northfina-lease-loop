// Card 2, the price lock: `laptop-004` is quoted on price list v1 (5 Nov 2026) and v2 is
// 8 % cheaper from 6 Nov. The stored quote keeps v1's price; its status tells the customer
// that a new quote would be cheaper.
import { describe, expect, it } from 'vitest';
import { addDays, breakdownFromFrozen, quoteStatusOn, QUOTE_VALID_DAYS } from '../pricing';
import { pack, quoteFor } from './fixtures';

const priced = (isoDate: string) => {
  const q = quoteFor({ assetId: 'laptop-004', termMonths: 36, isoDate });
  if (!q.ok) throw new Error(`laptop-004 does not price on ${isoDate}: ${q.reason.code}`);
  return q.quote;
};

const forStatus = (q: ReturnType<typeof priced>) => ({
  assetId: q.assetId,
  quoteDate: q.isoDate,
  validUntil: addDays(q.isoDate, QUOTE_VALID_DAYS),
  priceListVersion: q.priceListVersion,
  unitListPriceCents: q.unitListPriceCents,
});

describe('card 2: the price lock (laptop-004, 36 months)', () => {
  it.each([
    ['2026-11-05', 1, 349_000, 9_627],
    ['2026-11-06', 2, 321_100, 8_857],
  ])('on %s: list v%i, %i cents, band B, rent %i', (isoDate, version, list, rent) => {
    expect(priced(isoDate)).toMatchObject({
      priceListVersion: version,
      unitListPriceCents: list,
      band: 'B',
      monthlyNetCents: rent,
    });
  });

  it('the stored v1 quote, rebuilt from its frozen numbers, still says v1, 349 000 and 9 627', () => {
    const q = priced('2026-11-05');
    const rebuilt = breakdownFromFrozen(q);
    expect(rebuilt).toEqual(q);
    expect([rebuilt.priceListVersion, rebuilt.unitListPriceCents, rebuilt.monthlyNetCents]).toEqual(
      [1, 349_000, 9_627]
    );
  });

  it('on 6 Nov the quote is valid, locked to v1, and a cheaper v2 is live', () => {
    expect(quoteStatusOn(forStatus(priced('2026-11-05')), '2026-11-06', pack.priceLists)).toEqual({
      status: 'valid',
      validUntil: '2026-11-19',
      lockedListVersion: 1,
      lockedUnitPriceCents: 349_000,
      todayList: { version: 2, unitPriceCents: 321_100 },
      cheaperListLive: true,
    });
  });

  it('the quote is valid for its 14 days: valid on 19 Nov, expired on 20 Nov', () => {
    const quote = forStatus(priced('2026-11-05'));
    expect(quoteStatusOn(quote, '2026-11-19', pack.priceLists).status).toBe('valid');
    expect(quoteStatusOn(quote, '2026-11-20', pack.priceLists).status).toBe('expired');
  });
});
