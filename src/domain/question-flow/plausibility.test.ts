// The team's plausibility rules (D-rows "the twelve decided question-flow rules"): a deal or an
// answer that could be true but is unlikely is held for a person, never refused by the code.
import { describe, expect, it } from 'vitest';
import type { ConsumerLimits } from '@/data/schemas';
import {
  ownerShares,
  ownersProblem,
  plausibilityHolds,
  type PlausibilityInput,
} from './plausibility';

const LIMITS: ConsumerLimits = {
  note: 'team rule',
  max_consumer_quantity: { e_bike: 2, laptop: 2, farm_machine: 1 },
  consumer_manual_review: { e_bike: false, laptop: false, farm_machine: true },
  income_ceiling_cents: 10_000_000,
};

const consumer = (over: Partial<PlausibilityInput> = {}): PlausibilityInput => ({
  customerType: 'consumer',
  category: 'e_bike',
  quantity: 1,
  financedCents: 389_000,
  ...over,
});
const company = (over: Partial<PlausibilityInput> = {}): PlausibilityInput => ({
  customerType: 'company',
  category: 'e_bike',
  quantity: 1,
  financedCents: 389_000,
  ...over,
});
const codes = (input: PlausibilityInput, limits: ConsumerLimits | undefined = LIMITS) =>
  plausibilityHolds(limits, input).map((r) => r.code);

describe('rule 1: a consumer quantity over the category cap', () => {
  it.each([
    ['e_bike', 2, []],
    ['e_bike', 3, ['quantity_over_consumer_cap']],
    ['laptop', 2, []],
    ['laptop', 6, ['quantity_over_consumer_cap']],
  ] as const)('%s × %s → %j', (category, quantity, expected) => {
    expect(codes(consumer({ category, quantity }))).toEqual(expected);
  });

  it('names the category, the quantity and the cap', () => {
    expect(plausibilityHolds(LIMITS, consumer({ quantity: 20 }))).toEqual([
      {
        code: 'quantity_over_consumer_cap',
        params: { category: 'e_bike', quantity: 20, maxQuantity: 2 },
      },
    ]);
  });

  it('companies and sole traders are not capped (card 6: four e-bikes for a company)', () => {
    expect(codes(company({ quantity: 4 }))).toEqual([]);
    expect(codes({ ...company({ quantity: 40 }), customerType: 'sole_trader' })).toEqual([]);
  });

  it('without the limits file nothing is capped', () => {
    expect(plausibilityHolds(undefined, consumer({ quantity: 20 }))).toEqual([]);
  });

  it('an unknown category throws (D23), it is never silently uncapped', () => {
    expect(() => plausibilityHolds(LIMITS, consumer({ category: 'boat' }))).toThrow();
  });
});

describe('rule 2: a category a person always checks for a consumer', () => {
  it('a consumer and one farm machine → category_needs_review', () => {
    expect(plausibilityHolds(LIMITS, consumer({ category: 'farm_machine' }))).toEqual([
      { code: 'category_needs_review', params: { category: 'farm_machine' } },
    ]);
  });

  it('two farm machines hold for both reasons', () => {
    expect(codes(consumer({ category: 'farm_machine', quantity: 2 }))).toEqual([
      'quantity_over_consumer_cap',
      'category_needs_review',
    ]);
  });

  it('a company leasing a farm machine is not held (card 7)', () => {
    expect(codes(company({ category: 'farm_machine' }))).toEqual([]);
  });
});

describe('rule 3: a monthly income above the ceiling', () => {
  it.each([
    [10_000_000, []],
    [10_000_001, ['income_implausible']],
    [1_000_000_000, ['income_implausible']],
    [undefined, []],
  ])('%s cents → %j', (monthlyNetIncomeCents, expected) => {
    expect(codes(consumer({ monthlyNetIncomeCents }))).toEqual(expected);
  });

  it('holds a consumer only: a company or a sole trader above it is not held (finding 13)', () => {
    const income = { monthlyNetIncomeCents: 1_000_000_000 };
    expect(codes(company(income))).not.toContain('income_implausible');
    expect(codes({ ...consumer(income), customerType: 'sole_trader' })).not.toContain(
      'income_implausible'
    );
  });

  it('names the income and the ceiling', () => {
    expect(plausibilityHolds(LIMITS, consumer({ monthlyNetIncomeCents: 10_000_001 }))).toEqual([
      { code: 'income_implausible', params: { incomeCents: 10_000_001, ceilingCents: 10_000_000 } },
    ]);
  });
});

describe('rule 4: a company revenue below the financed amount', () => {
  it.each([
    [5_235_000, []],
    [5_234_999, ['revenue_below_financed']],
    [1, ['revenue_below_financed']],
    [0, ['revenue_below_financed']],
    [null, ['revenue_below_financed']],
    [undefined, []],
  ])('revenue %s on 5 235 000 financed → %j', (annualRevenueCents, expected) => {
    expect(codes(company({ financedCents: 5_235_000, annualRevenueCents }))).toEqual(expected);
  });

  it('a missing answer counts as zero in the params', () => {
    expect(
      plausibilityHolds(LIMITS, company({ financedCents: 100, annualRevenueCents: null }))
    ).toEqual([
      { code: 'revenue_below_financed', params: { revenueCents: 0, financedCents: 100 } },
    ]);
  });

  it('is a company rule: a consumer is not compared', () => {
    expect(codes(consumer({ annualRevenueCents: 0 }))).toEqual([]);
  });
});

describe('rule 5: beneficial owners', () => {
  it('reads a "(NN %)" share where there is one, and the name without it', () => {
    expect(ownerShares(['Jussi Haapala (60 %)', 'Maria Haapala (40%)', 'Hidden Holder'])).toEqual([
      { name: 'jussi haapala', hundredths: 6_000 },
      { name: 'maria haapala', hundredths: 4_000 },
      { name: 'hidden holder', hundredths: null },
    ]);
    expect(ownerShares(['A (33,33 %)', 'B (33.34 %)'])).toEqual([
      { name: 'a', hundredths: 3_333 },
      { name: 'b', hundredths: 3_334 },
    ]);
  });

  it.each([
    [['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'], null],
    [['A (33,33 %)', 'B (33,33 %)', 'C (33,34 %)'], null],
    [['A (60 %)', 'B (41 %)'], 'over_100'],
    [['A (100,01 %)'], 'over_100'],
    [['Jussi Haapala (60 %)', ' jussi haapala  (40 %)'], 'duplicate'],
    [['Same Name', 'SAME NAME'], 'duplicate'],
    [['Sole owner (100 %)'], null],
    [['Two partners, half each'], null],
    [['-'], null],
  ] as const)('%j → %s', (lines, expected) => {
    expect(ownersProblem(lines)).toBe(expected);
  });

  it('holds the case with the reason', () => {
    expect(
      plausibilityHolds(LIMITS, company({ beneficialOwners: ['A (60 %)', 'B (60 %)'] }))
    ).toEqual([{ code: 'owners_implausible', params: { reason: 'over_100' } }]);
  });
});
