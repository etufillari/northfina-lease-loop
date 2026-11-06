// Drills for the judges' three surprise scenarios (CHALLENGE.md section 4: "general rules beat
// hard-coded answers"). Each drill changes the data pack the way a surprise could, passes the
// variant in, and checks that the same pure functions give the rule's answer: a code with
// params, never a crash and never a number that only fits the ten cards.
import { describe, expect, it } from 'vitest';
import type { PriceList, SecondLifeRequest, VatRates } from '@/data/schemas';
import { addDays, buildSchedule, termEndDate } from '../invoicing';
import { priceQuote, type PricingData } from '../pricing';
import { matchDemand } from '../second-life/match';
import { applyFor, assessPackItem, customerById, pack, pricing, quoteFor } from './fixtures';

const quoteOn = (data: PricingData, assetId: string, isoDate: string, termMonths = 36) =>
  priceQuote(data, { assetId, termMonths, downPaymentCents: 0, isoDate });

describe('drill: a price list v3 after 6 Nov that moves items across bands', () => {
  const v2 = pack.priceLists.find((l) => l.version === 2)!;
  // v3 from 1 Dec 2026: laptop-001 up to 210 000 (band B), ebike-003 down to 150 000.
  const v3: PriceList = {
    ...v2,
    version: 3,
    valid_from: '2026-12-01',
    valid_to: null,
    prices: { ...v2.prices, 'laptop-001': 210_000, 'ebike-003': 150_000 },
  };
  const lists = [
    ...pack.priceLists.filter((l) => l.version !== 2),
    { ...v2, valid_to: '2026-11-30' },
    v3,
  ];
  const data: PricingData = { ...pricing, priceLists: lists };

  it('the day before v3 still prices on v2; from its first day on v3 and in the new band', () => {
    const before = quoteOn(data, 'laptop-001', '2026-11-30');
    const after = quoteOn(data, 'laptop-001', '2026-12-01');
    expect(before.ok && [before.quote.priceListVersion, before.quote.band]).toEqual([2, 'A']);
    expect(after.ok && [after.quote.priceListVersion, after.quote.band]).toEqual([3, 'B']);
    const bandB = pack.table.bands.find((b) => b.band === 'B')!;
    // The factor is B's at 36 months, in millionths, and the rent is financed × factor.
    expect(after.ok && after.quote.factorMillionths).toBe(
      Math.round(bandB.monthly_factor_by_term['36']! * 1_000_000)
    );
    expect(after.ok && after.quote.financedCents).toBe(210_000);
  });

  it('a price cut on v3 moves an item down a band: ebike-003 from B to A', () => {
    const before = quoteOn(data, 'ebike-003', '2026-11-30');
    const after = quoteOn(data, 'ebike-003', '2026-12-01');
    expect(before).toMatchObject({ ok: true, quote: { band: 'B' } });
    expect(after.ok && [after.quote.band, after.quote.financedCents]).toEqual(['A', 150_000]);
  });

  it('other band boundaries in the coefficient table move the same item without a code change', () => {
    const table = {
      ...pack.table,
      bands: pack.table.bands.map((b) =>
        b.band === 'A'
          ? { ...b, max_financed_cents: 99_999 }
          : b.band === 'B'
            ? { ...b, min_financed_cents: 100_000 }
            : b
      ),
    };
    const q = quoteOn({ ...pricing, table }, 'laptop-001', '2026-11-06');
    expect(q.ok && q.quote.band).toBe('B');
  });

  it('a day no list covers is a code, not a crash', () => {
    const gap = [{ ...v2, valid_to: '2026-11-30' }];
    const q = quoteOn({ ...pricing, priceLists: gap }, 'laptop-001', '2026-12-01');
    expect(q).toMatchObject({ ok: false, reason: { code: 'no_price_list_on_date' } });
  });
});

describe('drill: a VAT change on another date in a running contract', () => {
  // A fictional 27.5 % from 1 Jul 2027, after the pack's 26 %.
  const rates: VatRates = {
    ...pack.vatRates,
    rates: [
      ...pack.vatRates.rates.filter((r) => r.valid_to !== null),
      { rate_percent: 26, valid_from: '2027-01-01', valid_to: '2027-06-30' },
      { rate_percent: 27.5, valid_from: '2027-07-01', valid_to: null },
    ],
  };
  const schedule = buildSchedule({
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    termMonths: 36,
    downPaymentCents: 0,
    monthlyNetCents: 10_730,
    vatRates: rates,
  });
  if (!schedule.ok) throw new Error(schedule.reason);
  const on = (due: string) => schedule.invoices.find((i) => i.dueDate === due)!;

  it('each invoice takes the rate on its own issue day; the net never moves', () => {
    expect(
      ['2026-12-05', '2027-01-05', '2027-06-05', '2027-07-05'].map((d) => [
        on(d).vatRateBasisPoints,
        on(d).netCents,
      ])
    ).toEqual([
      [2_550, 10_730],
      [2_600, 10_730],
      [2_600, 10_730],
      [2_750, 10_730],
    ]);
  });

  it('VAT is rounded per invoice and the gross is net + VAT on every line', () => {
    expect(on('2027-07-05').vatCents).toBe(2_951); // 10 730 × 27.5 % = 2 950.75 → 2 951
    for (const invoice of schedule.invoices) {
      expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
    }
  });
});

describe('drill: a term the category cap refuses (D43)', () => {
  it('a 48-month laptop is refused with the cap, though the coefficient table has 48', () => {
    const q = quoteFor({ assetId: 'laptop-001', termMonths: 48, isoDate: '2026-11-06' });
    expect(q).toMatchObject({ ok: false, reason: { code: 'term_over_category_max' } });
  });

  it('a lower cap in the data refuses 36 months too; the cap is data, not code', () => {
    const termLimits = {
      ...pack.termLimits,
      max_term_months: { ...pack.termLimits.max_term_months, laptop: 24 },
    };
    const capped = quoteOn({ ...pricing, termLimits }, 'laptop-001', '2026-11-06');
    const fits = quoteOn({ ...pricing, termLimits }, 'laptop-001', '2026-11-06', 24);
    expect(capped).toMatchObject({ ok: false, reason: { code: 'term_over_category_max' } });
    expect(fits.ok).toBe(true);
  });

  it('a term the table does not have at all is its own code', () => {
    const q = quoteFor({ assetId: 'ebike-003', termMonths: 18, isoDate: '2026-11-06' });
    expect(q).toMatchObject({ ok: false, reason: { code: 'unknown_term' } });
  });
});

describe('drill: a lease starting on the leap day 29 Feb 2028', () => {
  it.each([
    [12, '2029-02-27'],
    [24, '2030-02-27'],
  ])('%i months: due on the 29th, the 28th in February 2029, ends %s', (termMonths, end) => {
    const s = buildSchedule({
      signedOn: '2028-02-29',
      startDate: '2028-02-29',
      termMonths,
      downPaymentCents: 0,
      monthlyNetCents: 10_000,
      vatRates: pack.vatRates,
    });
    if (!s.ok) throw new Error(s.reason);
    expect(s.invoices).toHaveLength(termMonths);
    expect(termEndDate('2028-02-29', termMonths)).toBe(end);
    expect(s.invoices.at(-1)?.periodEnd).toBe(end);
    expect(s.invoices.map((i) => i.dueDate.slice(8))).toEqual(
      s.invoices.map((i) => (i.dueDate.slice(5, 7) === '02' && i.sequence > 1 ? '28' : '29'))
    );
    // The periods touch: no day billed twice, none skipped, across both Februaries.
    for (let n = 1; n < s.invoices.length; n += 1) {
      expect(s.invoices[n]!.periodStart).toBe(addDays(s.invoices[n - 1]!.periodEnd!, 1));
    }
  });
});

describe('drill: a returned laptop through the assessment and the waiting list', () => {
  // laptop-007 as the pack has it: fair, 780 battery cycles, two past lives.
  const assessed = assessPackItem('laptop-007', '2026-11-06');
  const match = matchDemand(assessed, pack.demand);

  it('the data wipe is always charged and the battery is replaced at 500 cycles or more', () => {
    expect(assessed.options[0]!.plan.steps.map((s) => [s.id, s.costCents])).toEqual([
      ['certified_data_wipe', 2_500],
      ['battery_replacement', 9_000],
    ]);
    // D83: the cycles since the battery reset, the total cycles stay.
    expect(assessed.options[0]!.plan.usageSinceResetAfter.value).toBe(0);
    expect(assessed.options[0]!.plan.usageAfter.value).toBe(780);
  });

  it('only laptop entries are weighed; the winner takes it fair, the good-only twins rank below', () => {
    const laptopIds = pack.demand.filter((d) => d.category === 'laptop').map((d) => d.id);
    const weighed = match.verdicts.filter((v) => v.outcome.code !== 'other_category');
    expect(weighed.map((v) => v.demandId)).toEqual(laptopIds);
    expect(match.winner).toMatchObject({ demandId: 'wait-08', condition: 'fair', upgrade: false });
    // D86: good is 57 352, 2 101 for 24 months, under the twins' 2 500; they tie but for the id.
    expect(match.ranking.map((r) => [r.demandId, r.decidedBy])).toEqual([
      ['wait-08', null],
      ['wait-09', 'no_refurbishment'],
      ['wait-06', 'needed_by'],
      ['wait-14', 'id'],
      ['wait-07', 'needed_by'],
    ]);
  });

  it('a lighter-used laptop (good, 100 cycles) skips the battery and goes to another entry', () => {
    const light = assessPackItem('laptop-007', '2026-11-06', {
      condition: 'good',
      usage: { unit: 'battery_cycles', value: 100 },
    });
    expect(light.options[0]!.plan.steps.map((s) => s.id)).toEqual(['certified_data_wipe']);
    expect(matchDemand(light, pack.demand).winner).not.toBeNull();
  });
});

describe('drill: a waiting list where nobody fits', () => {
  const assessed = assessPackItem('ebike-007', '2026-11-06');
  const base = pack.demand.find((d) => d.id === 'wait-02')!;
  const entries: SecondLifeRequest[] = [
    { ...base, id: 'x-laptop', category: 'laptop' },
    { ...base, id: 'x-expired', needed_by: '2026-11-05' },
    { ...base, id: 'x-term', preferred_term_months: 60 },
    { ...base, id: 'x-budget', max_monthly_net_rent_cents: 1_000 },
  ];
  const match = matchDemand(assessed, entries, []);

  it('each verdict names the first step it failed', () => {
    expect(match.verdicts.map((v) => [v.demandId, v.outcome.code])).toEqual([
      ['x-laptop', 'other_category'],
      ['x-expired', 'expired'],
      ['x-term', 'term_not_offered'],
      ['x-budget', 'over_budget'],
    ]);
    expect(match.verdicts[3]?.outcome.params).toMatchObject({ maxMonthlyNetCents: 1_000 });
  });

  it('an entry already matched to another item is out (D62)', () => {
    const taken = matchDemand(assessed, [base], [base.id]);
    expect(taken.verdicts[0]?.outcome.code).toBe('already_matched');
    expect(taken.winner).toBeNull();
  });

  it('with no winner the item is relisted at the largest net gain, like new (D86)', () => {
    expect(match.winner).toBeNull();
    expect(match.ranking).toEqual([]);
    expect(match.decision.code).toBe('relist_without_match');
    // like new: +53 528 of value for +20 000 of work beats good's +35 685 for +12 000.
    expect(match.relist.condition).toBe('like_new');
  });

  it('an empty waiting list gives the same decision', () => {
    expect(matchDemand(assessed, []).decision.code).toBe('relist_without_match');
  });
});

describe('drill: a company applicant for each category through the decision', () => {
  const items = ['ebike-004', 'laptop-001', 'farm-003'] as const;
  it.each([
    ['cust-kettukoodi', 'approved', 'all_checks_passed'],
    ['cust-norvi', 'awaiting_signatory', 'signatory_needed'],
    ['cust-broken-id', 'rejected', 'invalid_business_id'],
  ])('%s gets %s for an e-bike, a laptop and a farm machine', (customerId, decision, reason) => {
    for (const assetId of items) {
      const applied = applyFor(customerById(customerId), {
        assetId,
        termMonths: 36,
        isoDate: '2026-11-06',
      });
      if (!applied.ok) throw new Error(`${assetId}: ${applied.step}`);
      expect([assetId, applied.result.decision]).toEqual([assetId, decision]);
      expect(applied.result.reasons.map((r) => r.code)).toContain(reason);
      // No company is asked a consumer's age question.
      expect(applied.askedIds.some((id) => id.includes('birth'))).toBe(false);
    }
  });

  it('cust-haapala, a PEP on record, is checked as a PEP only where the question is asked (D82)', () => {
    const decided = items.map((assetId) => {
      const applied = applyFor(customerById('cust-haapala'), {
        assetId,
        termMonths: 36,
        isoDate: '2026-11-06',
      });
      if (!applied.ok) throw new Error(`${assetId}: ${applied.step}`);
      return [assetId, applied.result.decision, applied.askedIds.includes('q_pep')];
    });
    // The e-bike and the laptop are under 10 000 € financed: no PEP question, no PEP check.
    expect(decided).toEqual([
      ['ebike-004', 'approved', false],
      ['laptop-001', 'approved', false],
      ['farm-003', 'manual_review', true],
    ]);
  });
});
