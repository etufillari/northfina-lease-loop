// Card 4, calendar traps: `laptop-001`, 36 months from 31 Jan 2026. The 31st does not exist
// in February: the due day clamps to the 28th in 2026 and to the leap day in 2028, and goes
// back to the 31st in March without drifting.
import { describe, expect, it } from 'vitest';
import { buildSchedule } from '../invoicing';
import { pack, quoteFor } from './fixtures';

const startDate = '2026-01-31';
const deal = { assetId: 'laptop-001', termMonths: 36, isoDate: startDate };

function invoices() {
  const q = quoteFor(deal);
  if (!q.ok) throw new Error(q.reason.code);
  const s = buildSchedule({
    signedOn: startDate,
    startDate,
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: q.quote.monthlyNetCents,
    vatRates: pack.vatRates,
  });
  if (!s.ok) throw new Error(s.reason);
  return s.invoices;
}

describe('card 4: calendar traps (laptop-001, 36 months from 31 Jan 2026)', () => {
  it('prices 119 900 in band A at 28 625 millionths: net 3 432', () => {
    const q = quoteFor(deal);
    expect(q.ok && [q.quote.band, q.quote.factorMillionths, q.quote.monthlyNetCents]).toEqual([
      'A',
      28_625,
      3_432,
    ]);
  });

  it.each([
    [2, '2026-02-28'],
    [3, '2026-03-31'],
    [26, '2028-02-29'],
    [27, '2028-03-31'],
  ])('invoice %i is due on %s', (sequence, due) => {
    expect(invoices().find((i) => i.sequence === sequence)?.dueDate).toBe(due);
  });

  it('every February invoice is due on the last day of February', () => {
    const february = invoices().filter((i) => i.dueDate.slice(5, 7) === '02');
    expect(february.map((i) => i.dueDate)).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('the first period ends the day before the clamped next due day; the term ends 30 Jan 2029', () => {
    const all = invoices();
    expect(all[0]).toMatchObject({ periodStart: '2026-01-31', periodEnd: '2026-02-27' });
    expect(all.at(-1)?.periodEnd).toBe('2029-01-30');
  });
});
