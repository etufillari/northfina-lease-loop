// Expected values from the data pack, CHALLENGE.md §4 and the calendar rule (D-016), worked by hand.
import { describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { AS_OF_MAX, parseAsOfDate } from './as-of';
import { DEMO_SCENARIOS, scenarioHref, shiftAsOf, type ScenarioStep } from './demo-scenarios';

describe('shiftAsOf', () => {
  it('31 Jan 2026 + 1 month is 28 Feb 2026 (clamped to the month end, D-016)', () => {
    expect(shiftAsOf('2026-01-31', { months: 1 })).toBe('2026-02-28');
  });

  it('5 Nov 2026 + 6 months is 5 May 2027, the first day of month 7 (card 8)', () => {
    expect(shiftAsOf('2026-11-05', { months: 6 })).toBe('2027-05-05');
  });

  it('5 Nov 2026 + 12 months is 5 Nov 2027', () => {
    expect(shiftAsOf('2026-11-05', { months: 12 })).toBe('2027-11-05');
  });

  it('stops at the last allowed demo date, 31 Dec 2035', () => {
    expect(shiftAsOf('2035-06-01', { months: 12 })).toBe(AS_OF_MAX);
  });

  it('only moves forward: Back to today goes the other way', () => {
    expect(() => shiftAsOf('2026-11-05', { months: -1 })).toThrow(RangeError);
  });
});

describe('scenarioHref', () => {
  const asset: ScenarioStep = {
    asOf: '2026-11-05',
    target: { kind: 'asset', assetId: 'ebike-003' },
  };

  it('opens an item page, with the locale first', () => {
    expect(scenarioHref(asset, 'fi')).toBe('/fi/assets/ebike-003');
  });

  it('opens a passport', () => {
    const passport: ScenarioStep = {
      asOf: '2026-11-06',
      target: { kind: 'passport', assetId: 'ebike-008' },
    };
    expect(scenarioHref(passport, 'en')).toBe('/en/assets/ebike-008/passport');
  });

  it('leaves contract and quote targets to the server, which knows their ids', () => {
    const contract: ScenarioStep = {
      asOf: '2027-05-05',
      target: { kind: 'contract', assetId: 'ebike-003', status: 'active' },
    };
    const quote: ScenarioStep = {
      asOf: '2026-11-06',
      target: { kind: 'open_quote', assetId: 'laptop-004' },
    };
    expect(scenarioHref(contract, 'en')).toBeNull();
    expect(scenarioHref(quote, 'en')).toBeNull();
  });
});

describe('DEMO_SCENARIOS', () => {
  const steps = DEMO_SCENARIOS.flatMap((s) => s.steps);

  it('has the 10 cards of CHALLENGE.md §4, each once, in order', () => {
    expect(DEMO_SCENARIOS.map((s) => s.card)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('starts each card on the day its walkthrough needs', () => {
    const dates = Object.fromEntries(
      DEMO_SCENARIOS.map((s) => [s.card, s.steps.map((x) => x.asOf)])
    );
    // Card 2: quote on Thursday (price list 1), sign on Friday (price list 2 from 6 Nov).
    expect(dates[2]).toEqual(['2026-11-05', '2026-11-06']);
    // Card 3: the lease starts 15 Sep 2026, so it runs across the 1 Jan 2027 VAT change.
    expect(dates[3]).toEqual(['2026-09-15']);
    // Card 4: a 31 January start.
    expect(dates[4]).toEqual(['2026-01-31']);
    // Card 6: sent on 5 Nov, signed by the signatory on 20 Nov (D-053).
    expect(dates[6]).toEqual(['2026-11-05', '2026-11-20']);
    // Card 8: month 7 of card 1's lease (5 Nov 2026 start) runs 5 May – 4 Jun 2027.
    expect(dates[8]).toEqual(['2027-05-05']);
  });

  it('names only items that exist in the data pack', async () => {
    const ids = new Set((await loadAssets()).map((a) => a.id));
    for (const step of steps) expect(ids).toContain(step.target.assetId);
  });

  it('names only customers that exist in the data pack', async () => {
    const ids = new Set((await loadCustomers()).map((c) => c.id));
    for (const step of steps) {
      if (step.target.kind === 'contract' && step.target.customerId) {
        expect(ids).toContain(step.target.customerId);
      }
    }
  });

  it('sets only demo dates the app accepts', () => {
    for (const step of steps)
      expect(parseAsOfDate(step.asOf)).toEqual({ ok: true, date: step.asOf });
  });

  it('never carries an expected result: steps hold only a date and where to go', () => {
    for (const step of steps) expect(Object.keys(step).sort()).toEqual(['asOf', 'target']);
  });
});
