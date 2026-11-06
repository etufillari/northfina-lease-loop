// The traps the data pack hides (docs/kickoff-brief.md section 8): every one gives a number or
// a code, never a crash.
import { describe, expect, it } from 'vitest';
import { buildSchedule } from '../invoicing';
import { listPriceOn } from '../price-list';
import { matchDemand } from '../second-life/match';
import { applyFor, assessPackItem, assetById, customerById, pack, quoteFor } from './fixtures';

const V1_DAY = '2026-11-05';
const V2_DAY = '2026-11-06';

describe('trap: the band boundary is inclusive (price list v1)', () => {
  it.each([
    ['laptop-002', 199_999, 'A'],
    ['laptop-003', 200_000, 'B'],
  ])('%s at %i cents is band %s', (assetId, financed, band) => {
    const q = quoteFor({ assetId, termMonths: 36, isoDate: V1_DAY });
    expect(q.ok && [q.quote.financedCents, q.quote.band]).toEqual([financed, band]);
  });

  it('on v2 both cost 184 000 and fall in band A: the boundary trap is a v1 trap', () => {
    for (const assetId of ['laptop-002', 'laptop-003']) {
      const q = quoteFor({ assetId, termMonths: 36, isoDate: V2_DAY });
      expect(q.ok && [q.quote.financedCents, q.quote.band]).toEqual([184_000, 'A']);
    }
  });
});

describe('trap: outside the table is a code, not a crash', () => {
  it('ebike-010 at 28 900 on v1 is below the lowest band (30 000)', () => {
    const q = quoteFor({ assetId: 'ebike-010', termMonths: 36, isoDate: V1_DAY });
    expect(q).toEqual({
      ok: false,
      reason: { code: 'below_minimum', params: { financedCents: 28_900, minimumCents: 30_000 } },
    });
  });

  it('ebike-010 at 30 300 on v2 is in band A: the price list moves it into the table', () => {
    const q = quoteFor({ assetId: 'ebike-010', termMonths: 36, isoDate: V2_DAY });
    expect(q.ok && [q.quote.financedCents, q.quote.band]).toEqual([30_300, 'A']);
  });

  it('farm-006 at 26 000 000 is above the highest band (25 000 000)', () => {
    const q = quoteFor({ assetId: 'farm-006', termMonths: 48, isoDate: V1_DAY });
    expect(q).toEqual({
      ok: false,
      reason: {
        code: 'above_maximum',
        params: { financedCents: 26_000_000, maximumCents: 25_000_000 },
      },
    });
  });

  it('farm-006 with 1 000 000 down finances 25 000 000, the top of band D', () => {
    const q = quoteFor({
      assetId: 'farm-006',
      termMonths: 48,
      downPaymentCents: 1_000_000,
      isoDate: V1_DAY,
    });
    expect(q.ok && [q.quote.financedCents, q.quote.band]).toEqual([25_000_000, 'D']);
  });

  it('an application for an unpriceable deal stops at the quote with its code', () => {
    const app = applyFor(customerById('cust-aino'), {
      assetId: 'farm-006',
      termMonths: 48,
      isoDate: V1_DAY,
    });
    expect(app.ok === false && app.step === 'quote' && app.quote.ok === false).toBe(true);
  });
});

describe('trap: the reserved ebike-009', () => {
  it('is reserved in the pack but has a list price (the page may show it)', () => {
    expect(assetById('ebike-009').status).toBe('reserved');
    expect(listPriceOn(pack.priceLists, 'ebike-009', V1_DAY)).toEqual({
      ok: true,
      priceCents: 459_000,
      priceListVersion: 1,
    });
  });

  // The refusal reads the asset's status, which lives in the database, so it is proved where
  // the status is read: src/server/quotes.test.ts "refuses a reserved asset (ebike-009) with
  // its status" (asset_not_available). An application needs a stored quote, so it cannot
  // reach ebike-009 either.
});

describe('trap: the broken business ID', () => {
  it('cust-broken-id (1234567-8, check digit should differ) is rejected with invalid_business_id', () => {
    const app = applyFor(customerById('cust-broken-id'), {
      assetId: 'laptop-005',
      termMonths: 36,
      isoDate: V1_DAY,
    });
    expect(app.ok && app.result).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'invalid_business_id', params: { businessId: '1234567-8' } }],
    });
  });
});

describe('trap: the twin pairs of the waiting list', () => {
  const entry = (id: string) => {
    const found = pack.demand.find((d) => d.id === id);
    if (!found) throw new Error(`no ${id}`);
    return found;
  };
  /** What an entry asks for, without its id and its description. */
  const needs = (id: string) =>
    Object.fromEntries(Object.entries(entry(id)).filter(([key]) => key !== 'id' && key !== 'who'));
  const needs02 = needs('wait-02');
  const needs13 = needs('wait-13');

  it('wait-02 and wait-13 have the same budget but differ in condition and term', () => {
    expect(needs02.max_monthly_net_rent_cents).toBe(needs13.max_monthly_net_rent_cents);
    expect([needs02.min_condition, needs02.preferred_term_months]).toEqual(['fair', 12]);
    expect([needs13.min_condition, needs13.preferred_term_months]).toEqual(['good', 24]);
  });

  it('wait-06 and wait-14 need the same; only the list order (sign-up) tells them apart', () => {
    expect(needs('wait-14')).toEqual(needs('wait-06'));
    const ids = pack.demand.map((d) => d.id);
    expect(ids.indexOf('wait-06')).toBeLessThan(ids.indexOf('wait-14'));
  });

  it('the matcher gives a fair-condition ebike to wait-02, never wait-13', () => {
    const match = matchDemand(assessPackItem('ebike-007', V2_DAY), pack.demand);
    expect(match.winner).toMatchObject({ demandId: 'wait-02', condition: 'fair', upgrade: false });
    // wait-13 fits only refurbished to good, so D13's first step puts it below.
    const wait13 = match.ranking.find((r) => r.demandId === 'wait-13');
    expect(wait13).toMatchObject({ upgrade: true, decidedBy: 'no_refurbishment' });
  });

  it('the matcher prefers wait-06 over wait-14, who signed up a day later: D13 by the lower id', () => {
    // laptop-007 (fair, 780 cycles) refurbished to good fits both at the same rent (D86: 57 352,
    // 2 101 for 24 months; laptop-006 good is 27 577, under band A's minimum); wait-08 and
    // wait-09 are matched sooner, so they are taken here to leave the twins at the top.
    const match = matchDemand(assessPackItem('laptop-007', V2_DAY), pack.demand, [
      'wait-08',
      'wait-09',
    ]);
    expect(match.winner?.demandId).toBe('wait-06');
    expect(match.ranking[1]).toMatchObject({ demandId: 'wait-14', decidedBy: 'id' });
    expect(match.ranking[1]?.monthlyNetCents).toBe(match.winner?.monthlyNetCents);
  });
});

describe('trap: the VAT boundary on 1 Jan 2027', () => {
  it('an invoice issued 2026-12-31 is at 25.5 %, one issued 2027-01-01 at 26 %', () => {
    const s = buildSchedule({
      signedOn: '2026-10-31',
      startDate: '2026-10-31',
      termMonths: 3,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
      vatRates: pack.vatRates,
    });
    const first = buildSchedule({
      signedOn: '2026-11-01',
      startDate: '2026-11-01',
      termMonths: 3,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
      vatRates: pack.vatRates,
    });
    if (!s.ok || !first.ok) throw new Error('no schedule');
    expect(s.invoices.map((i) => [i.issueDate, i.vatRateBasisPoints, i.grossCents])).toEqual([
      ['2026-10-31', 2_550, 12_550],
      ['2026-11-30', 2_550, 12_550],
      ['2026-12-31', 2_550, 12_550],
    ]);
    expect(first.invoices.at(-1)).toMatchObject({
      issueDate: '2027-01-01',
      vatRateBasisPoints: 2_600,
      grossCents: 12_600,
    });
  });

  it('a down payment signed on 1 Jan 2027 takes 26 %', () => {
    const s = buildSchedule({
      signedOn: '2027-01-01',
      startDate: '2027-01-01',
      termMonths: 12,
      downPaymentCents: 50_000,
      monthlyNetCents: 10_000,
      vatRates: pack.vatRates,
    });
    expect(s.ok && s.invoices[0]).toMatchObject({
      sequence: 0,
      kind: 'down_payment',
      vatRateBasisPoints: 2_600,
      vatCents: 13_000,
    });
  });
});

describe('trap: the leap day', () => {
  it('a contract from 29 Jan 2027 is due 28 Feb 2027 and 29 Feb 2028', () => {
    const s = buildSchedule({
      signedOn: '2027-01-29',
      startDate: '2027-01-29',
      termMonths: 24,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
      vatRates: pack.vatRates,
    });
    const feb = s.ok ? s.invoices.filter((i) => i.dueDate.slice(5, 7) === '02') : [];
    expect(feb.map((i) => i.dueDate)).toEqual(['2027-02-28', '2028-02-29']);
  });

  it('a contract starting on the leap day itself is due on the 29th, and 28 Feb 2029', () => {
    const s = buildSchedule({
      signedOn: '2028-02-29',
      startDate: '2028-02-29',
      termMonths: 13,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
      vatRates: pack.vatRates,
    });
    const due = s.ok ? s.invoices.map((i) => i.dueDate) : [];
    expect([due[0], due[1], due[12]]).toEqual(['2028-02-29', '2028-03-29', '2029-02-28']);
  });
});

describe('trap: the price list in force on each day', () => {
  it.each([
    ['2026-11-05', 1, 389_000],
    ['2026-11-06', 2, 408_400],
  ])('on %s ebike-003 is priced from v%i at %i', (isoDate, version, price) => {
    expect(listPriceOn(pack.priceLists, 'ebike-003', isoDate)).toEqual({
      ok: true,
      priceCents: price,
      priceListVersion: version,
    });
  });

  it('before 2026 there is no list: a code, not a crash', () => {
    const q = quoteFor({ assetId: 'ebike-003', termMonths: 36, isoDate: '2025-12-31' });
    expect(q).toEqual({
      ok: false,
      reason: { code: 'no_price_list_on_date', params: { isoDate: '2025-12-31' } },
    });
  });
});
