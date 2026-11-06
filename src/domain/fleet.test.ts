import { describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadQuestions } from '@/data/load';
import { checkFleet, fleetQuestionContext, fleetTotals, isBusinessApplicant } from './fleet';
import { quoteLease, type LeaseQuote } from './pricing';
import { getVisibleQuestions } from './question-flow';

const table = await loadCoefficientTable();
const { questions } = await loadQuestions();

function quote(listPriceCents: number): LeaseQuote {
  const result = quoteLease(
    { listPriceCents, downPaymentCents: 0, termMonths: 36, vatPercent: 25.5 },
    table
  );
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
}

// laptop-001, -002, -003, -004 and -008 on price list v1.
const laptops = [119_900, 199_999, 200_000, 349_000, 289_000].map(quote);

describe('checkFleet', () => {
  const item = (id: string, category: 'laptop' | 'e_bike' = 'laptop') => ({ id, category });

  it('needs at least two different items of one category', () => {
    expect(checkFleet([item('a')])).toEqual({ ok: false, reason: 'too_few' });
    expect(checkFleet([item('a'), item('a')])).toEqual({ ok: false, reason: 'duplicate' });
    expect(checkFleet([item('a'), item('b', 'e_bike')])).toEqual({
      ok: false,
      reason: 'mixed_categories',
    });
    expect(checkFleet([item('a'), item('b')])).toEqual({ ok: true });
  });

  it('has an upper limit', () => {
    const many = Array.from({ length: 21 }, (_, i) => item(`x${i}`));
    expect(checkFleet(many)).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('fleetTotals', () => {
  it('adds up each item’s own, already rounded, quote', () => {
    const totals = fleetTotals(laptops);
    expect(totals.count).toBe(5);
    expect(totals.financedCents).toBe(1_157_899);
    expect(totals.monthlyNetCents).toBe(laptops.reduce((s, q) => s + q.monthlyNetCents, 0));
    expect(totals.monthlyGrossCents).toBe(totals.monthlyNetCents + totals.monthlyVatCents);
  });
});

describe('fleetQuestionContext', () => {
  const company = { q_customer_type: 'company' };
  const visibleIds = (quotes: LeaseQuote[]) =>
    getVisibleQuestions(
      questions,
      company,
      fleetQuestionContext({ category: 'laptop', termMonths: 36, quotes, todayIso: '2026-11-05' })
    ).map((q) => q.id);

  it('asks the questions for the whole deal: five laptops pass the 10,000 € PEP threshold', () => {
    expect(visibleIds(laptops.slice(0, 1))).not.toContain('q_pep');
    expect(visibleIds(laptops)).toContain('q_pep');
  });

  it('does not apply the per-item band limits to the total', () => {
    const context = fleetQuestionContext({
      category: 'laptop',
      termMonths: 36,
      quotes: laptops,
      todayIso: '2026-11-05',
    });
    expect(context.maxFinancedCents).toBeGreaterThan(25_000_000);
  });
});

describe('isBusinessApplicant', () => {
  it('lets companies and sole traders lease fleets, not private persons', () => {
    expect(isBusinessApplicant({ q_customer_type: 'company' })).toBe(true);
    expect(isBusinessApplicant({ q_customer_type: 'sole_trader' })).toBe(true);
    expect(isBusinessApplicant({ q_customer_type: 'consumer' })).toBe(false);
    expect(isBusinessApplicant({})).toBe(false);
  });
});
