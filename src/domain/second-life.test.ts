import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadSecondLifeDemand, loadVatRates } from '@/data/load';
import type { CoefficientTable, SecondLifeRequest, VatRate } from '@/data/schemas';
import { matchWaitingList, refurbishDecision } from './second-life';

let table: CoefficientTable;
let rates: VatRate[];
let demand: SecondLifeRequest[];
beforeAll(async () => {
  const [coefficients, vat, list] = await Promise.all([
    loadCoefficientTable(),
    loadVatRates(),
    loadSecondLifeDemand(),
  ]);
  table = coefficients;
  rates = vat.rates;
  demand = list;
});

const today = '2026-11-06';
// Card 9: ebike-007 relists at €1,866.60 net after €670.00 of work, refurbished to good.
const ebike007 = { category: 'e_bike' as const, condition: 'good' as const, priceNetCents: 186660 };
const byId = (result: ReturnType<typeof matchWaitingList>, id: string) =>
  result.candidates.find((candidate) => candidate.request.id === id)!;

describe('refurbishDecision', () => {
  it('refurbishes card 9 because the item is worth more than the work', () => {
    expect(
      refurbishDecision({ priceNetCents: 186660, refurbishmentCostCents: 67000, leasable: true })
    ).toEqual({
      refurbish: true,
      reason: 'worth_it',
      priceNetCents: 186660,
      refurbishmentCostCents: 67000,
      netResultCents: 119660,
    });
  });
  it('retires an item whose work costs as much as it is worth, or that nobody can lease', () => {
    expect(
      refurbishDecision({ priceNetCents: 5000, refurbishmentCostCents: 5000, leasable: true })
    ).toMatchObject({ refurbish: false, reason: 'costs_more_than_value', netResultCents: 0 });
    expect(
      refurbishDecision({ priceNetCents: 90000, refurbishmentCostCents: 100, leasable: false })
    ).toMatchObject({ refurbish: false, reason: 'not_leasable' });
  });
});

describe('matchWaitingList', () => {
  it('card 9: wait-13 gets ebike-007, because wait-02 cannot afford it over 12 months', () => {
    const result = matchWaitingList(ebike007, demand, today, table, rates);
    expect(result.winner?.request.id).toBe('wait-13');
    // Same budget and deadline, but 12 months makes the monthly rent higher than €90.
    const wait02 = byId(result, 'wait-02');
    expect(wait02.failed).toEqual(['budget']);
    expect(wait02.monthlyNetCents).toBeGreaterThan(9000);
    const wait13 = byId(result, 'wait-13');
    expect(wait13.failed).toEqual([]);
    expect(wait13.monthlyNetCents).toBeLessThanOrEqual(9000);
    // wait-04 also qualifies but needs it later, so the earlier deadline decides.
    expect(byId(result, 'wait-04').failed).toEqual([]);
    expect(result.decidedBy).toBe('earliest_deadline');
    expect(result.candidates.map((candidate) => candidate.request.id).slice(0, 2)).toEqual([
      'wait-13',
      'wait-04',
    ]);
    // Only e-bike entries are candidates.
    expect(result.candidates.every((candidate) => candidate.request.category === 'e_bike')).toBe(
      true
    );
  });

  it('checks the minimum condition: a fair bike is below what wait-13 accepts', () => {
    const result = matchWaitingList(
      { ...ebike007, condition: 'fair' },
      demand,
      today,
      table,
      rates
    );
    expect(byId(result, 'wait-13').failed).toContain('condition');
    expect(byId(result, 'wait-02').failed).not.toContain('condition');
  });

  it('gives two people with the same needs to whoever signed up first', () => {
    const laptop = {
      category: 'laptop' as const,
      condition: 'good' as const,
      priceNetCents: 60000,
    };
    const twins = demand.filter((entry) => ['wait-06', 'wait-14'].includes(entry.id));
    const result = matchWaitingList(laptop, twins, today, table, rates);
    expect(result.winner?.request.id).toBe('wait-06');
    expect(result.decidedBy).toBe('earliest_signup');
  });

  it('skips people whose deadline has passed, and reports a single match', () => {
    const result = matchWaitingList(ebike007, demand, '2026-11-11', table, rates);
    expect(byId(result, 'wait-13').failed).toEqual(['deadline']);
    expect(result.winner?.request.id).toBe('wait-04');
    expect(result.decidedBy).toBe('only_match');
  });

  it('reports a term the financing table does not offer, and no winner when nobody fits', () => {
    const odd = [{ ...demand[1]!, preferred_term_months: 13 }];
    const result = matchWaitingList(ebike007, odd, today, table, rates);
    expect(result.candidates[0]!.failed).toContain('term');
    expect(result.candidates[0]!.monthlyNetCents).toBeNull();
    expect(result.winner).toBeNull();
    expect(result.decidedBy).toBeNull();
  });
});
