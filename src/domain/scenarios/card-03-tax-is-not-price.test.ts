// Card 3, tax is not price: `ebike-001`, 24 months from 15 Sep 2026. The net rent is locked;
// each invoice takes the VAT rate of its own date, so January 2027 is dearer than December.
import { describe, expect, it } from 'vitest';
import { buildSchedule, firstVatChange } from '../invoicing';
import { pack, quoteFor } from './fixtures';

const startDate = '2026-09-15';

function contract() {
  const q = quoteFor({ assetId: 'ebike-001', termMonths: 24, isoDate: startDate });
  if (!q.ok) throw new Error(q.reason.code);
  const s = buildSchedule({
    signedOn: startDate,
    startDate,
    termMonths: 24,
    downPaymentCents: 0,
    monthlyNetCents: q.quote.monthlyNetCents,
    vatRates: pack.vatRates,
  });
  if (!s.ok) throw new Error(s.reason);
  return { quote: q.quote, invoices: s.invoices };
}

describe('card 3: tax is not price (ebike-001, 24 months from 15 Sep 2026)', () => {
  it('prices on v1: 189 900 in band A at 36 637 millionths, net 6 957', () => {
    expect(contract().quote).toMatchObject({
      unitListPriceCents: 189_900,
      band: 'A',
      factorMillionths: 36_637,
      monthlyNetCents: 6_957,
    });
  });

  it.each([
    ['2026-12-15', 2_550, 1_774, 8_731],
    ['2027-01-15', 2_600, 1_809, 8_766],
  ])('the invoice of %s: %i bp, VAT %i, gross %i', (issueDate, rate, vat, gross) => {
    expect(contract().invoices.find((i) => i.issueDate === issueDate)).toMatchObject({
      netCents: 6_957,
      vatRateBasisPoints: rate,
      vatCents: vat,
      grossCents: gross,
    });
  });

  it('the net never changes; the rate changes on 1 Jan 2027', () => {
    const { invoices } = contract();
    expect(new Set(invoices.map((i) => i.netCents))).toEqual(new Set([6_957]));
    expect(firstVatChange(invoices, pack.vatRates)).toEqual({
      oldRateBasisPoints: 2_550,
      newRateBasisPoints: 2_600,
      lastOldDay: '2026-12-31',
      firstNewDay: '2027-01-01',
    });
  });
});
