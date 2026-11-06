import { describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCustomers,
  loadPriceLists,
  loadCoefficientTable,
  loadVatRates,
  loadQuestions,
} from '@/data/load';
import { monthlyRentFor } from './monthly-rent';
import { listPriceOn } from './price-list';
import { calculateInvoice } from './lease-engine/invoice';
import { calculateBillingSchedule } from './lease-engine/calendar';
import { decideApplication } from './application';
import { applicableQuestions } from './question-flow';
const assets = await loadAssets(),
  customers = await loadCustomers(),
  prices = await loadPriceLists(),
  table = await loadCoefficientTable(),
  rates = (await loadVatRates()).rates;
function terms(assetId: string, startDate: string, termMonths: 12 | 24 | 36 | 48, down = 0) {
  const price = listPriceOn(prices, assetId, startDate);
  if (!price.ok) throw new Error('missing price');
  const rent = monthlyRentFor(table, price.priceCents, down, termMonths);
  if (!rent.ok) throw new Error('invalid rent');
  return {
    contractId: 'scenario',
    assetId,
    customerId: 'cust-aino',
    startDate,
    termMonths,
    monthlyNetCents: rent.monthlyRentCents,
    paymentDueDays: 14,
  };
}
describe('challenge scenario cards 1–7 with actual pack', () => {
  it('card1: golden monthly price, first3 invoices and scheduled net total', () => {
    const input = terms('ebike-003', '2026-11-05', 36);
    expect(input.monthlyNetCents).toBe(10730);
    expect(
      [1, 2, 3].map((index) => {
        const r = calculateInvoice(input, index, rates);
        return r.ok ? r.value.grossCents : 0;
      })
    ).toEqual([13466, 13466, 13520]);
    const schedule = calculateBillingSchedule(input);
    expect(schedule.ok && schedule.value.reduce((n, p) => n + p.netCents, 0)).toBe(386280);
  });
  it('card2: quote v1 and fresh v2 differ, signed snapshots retain their quoted net', () => {
    const v1 = terms('laptop-004', '2026-11-05', 36),
      v2 = terms('laptop-004', '2026-11-06', 36);
    expect(v2.monthlyNetCents).toBeLessThan(v1.monthlyNetCents);
    expect(calculateInvoice(v1, 1, rates)).toMatchObject({
      ok: true,
      value: { netCents: v1.monthlyNetCents },
    });
  });
  it('card3: September start has December2550bps and January2600bps with locked net', () => {
    const input = terms('ebike-001', '2026-09-15', 24);
    expect(calculateInvoice(input, 4, rates)).toMatchObject({
      ok: true,
      value: { netCents: input.monthlyNetCents, tax: { rateBps: 2550 } },
    });
    expect(calculateInvoice(input, 5, rates)).toMatchObject({
      ok: true,
      value: { netCents: input.monthlyNetCents, tax: { rateBps: 2600 } },
    });
  });
  it('card4: original Jan31 anchor survives February2026 and leap February2028', () => {
    const schedule = calculateBillingSchedule(terms('laptop-001', '2026-01-31', 36));
    if (!schedule.ok) throw new Error('schedule');
    expect(schedule.value[1]?.dueDate).toBe('2026-03-14');
    expect(schedule.value[25]?.dueDate).toBe('2028-03-14');
  });
  it('cards5/6: underage customer rejected and unauthorized company cannot sign (fleet guard)', () => {
    const mikko = customers.find((c) => c.id === 'cust-mikko'),
      norvi = customers.find((c) => c.id === 'cust-norvi'),
      asset = assets.find((a) => a.id === 'ebike-004');
    if (!mikko || !norvi || !asset) throw new Error('fixtures');
    expect(
      decideApplication({ customer: mikko, asset, monthlyNetCents: 10000, asOf: '2026-11-05' })
    ).toMatchObject({ status: 'REJECTED', signingAuthority: false });
    expect(
      decideApplication({ customer: norvi, asset, monthlyNetCents: 4 * 10000, asOf: '2026-11-05' })
    ).toMatchObject({ status: 'MANUAL_REVIEW', signingAuthority: false });
  });
  it('card7: high-ticket farm questions apply and PEP stays in manual review', async () => {
    const customer = customers.find((c) => c.id === 'cust-haapala'),
      asset = assets.find((a) => a.id === 'farm-002');
    if (!customer || !asset) throw new Error('fixtures');
    const input = terms(asset.id, '2026-11-05', 48, 2000000);
    expect(
      decideApplication({
        customer,
        asset,
        monthlyNetCents: input.monthlyNetCents,
        asOf: input.startDate,
      })
    ).toMatchObject({ status: 'MANUAL_REVIEW' });
    expect(
      applicableQuestions(
        (await loadQuestions()).questions,
        {
          customerType: customer.type,
          category: asset.category,
          financedCents: 12500000,
          termMonths: 48,
        },
        {}
      ).map((q) => q.id)
    ).toContain('q_beneficial_owners');
  });
});
