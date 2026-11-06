import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadAssets,
  loadCo2Factors,
  loadConsumerLimits,
  loadCoefficientTable,
  loadCustomers,
  loadDataFile,
  loadPriceLists,
  loadQuestions,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadTermLimits,
  loadVatRates,
} from './load';
import {
  coefficientTableSchema,
  consumerLimitsSchema,
  priceListsFileSchema,
  termLimitsSchema,
} from './schemas';

describe('data pack', () => {
  it('every file in data/ parses against its schema', async () => {
    const [assets, priceLists, table, curves, vat, questions, customers, demand, refurb, co2] =
      await Promise.all([
        loadAssets(),
        loadPriceLists(),
        loadCoefficientTable(),
        loadResidualCurves(),
        loadVatRates(),
        loadQuestions(),
        loadCustomers(),
        loadSecondLifeDemand(),
        loadRefurbishmentCosts(),
        loadCo2Factors(),
      ]);

    expect(assets).toHaveLength(30);
    expect(priceLists.map((list) => list.version)).toEqual([1, 2]);
    expect(table.bands.map((band) => band.band)).toEqual(['A', 'B', 'C', 'D']);
    expect(curves.curves.e_bike[0]).toEqual([0, 100]);
    expect(vat.country).toBe('FI');
    expect(questions.questions.length).toBeGreaterThan(0);
    expect(customers.length).toBeGreaterThan(0);
    expect(demand.length).toBeGreaterThan(0);
    expect(refurb.laptop.fixed.length).toBeGreaterThan(0);
    expect(co2.manufacturing_new_kg.e_bike).toBeGreaterThan(0);
  });

  it('has a price for every asset in every price list', async () => {
    const [assets, priceLists] = await Promise.all([loadAssets(), loadPriceLists()]);
    for (const list of priceLists) {
      for (const asset of assets) {
        expect(list.prices[asset.id], `${asset.id} in price list ${list.version}`).toBeTypeOf(
          'number'
        );
      }
    }
  });

  it('reports which file and field is wrong when data does not match', async () => {
    const strict = z.array(z.strictObject({ id: z.number() }));
    await expect(loadDataFile('assets.json', strict)).rejects.toThrow(
      /data\/assets\.json does not match its schema/
    );
  });
});

describe("the team's term limits beside the pack (D43)", () => {
  it("parses, says it is the team's rule and caps every category within the table's terms", async () => {
    const [limits, table] = await Promise.all([loadTermLimits(), loadCoefficientTable()]);
    expect(limits.note).toMatch(/team/i);
    const terms = Object.keys(table.end_of_term_buyout_percent_of_financed).map(Number);
    const longest = Math.max(...terms);
    for (const [category, cap] of Object.entries(limits.max_term_months)) {
      expect(cap, category).toBeGreaterThan(0);
      expect(cap, category).toBeLessThanOrEqual(longest);
    }
    expect(Object.keys(limits.max_term_months).sort()).toEqual([
      'e_bike',
      'farm_machine',
      'laptop',
    ]);
  });

  it('rejects a missing category, an unknown one and a cap that is not a positive whole month', () => {
    const good = {
      note: 'team rule',
      max_term_months: { e_bike: 48, laptop: 36, farm_machine: 48 },
    };
    expect(termLimitsSchema.safeParse(good).success).toBe(true);
    const { laptop, ...missing } = good.max_term_months;
    void laptop;
    expect(termLimitsSchema.safeParse({ ...good, max_term_months: missing }).success).toBe(false);
    expect(
      termLimitsSchema.safeParse({
        ...good,
        max_term_months: { ...good.max_term_months, boat: 12 },
      }).success
    ).toBe(false);
    for (const bad of [0, -12, 36.5]) {
      expect(
        termLimitsSchema.safeParse({
          ...good,
          max_term_months: { ...good.max_term_months, laptop: bad },
        }).success,
        String(bad)
      ).toBe(false);
    }
  });
});

describe("the team's consumer limits beside the pack", () => {
  it("parses, says it is the team's rule and holds the decided numbers", async () => {
    const limits = await loadConsumerLimits();
    expect(limits.note).toMatch(/team/i);
    expect(limits.max_consumer_quantity).toEqual({ e_bike: 2, laptop: 2, farm_machine: 1 });
    expect(limits.consumer_manual_review.farm_machine).toBe(true);
    expect(limits.income_ceiling_cents).toBe(10_000_000);
  });

  it('rejects a missing or unknown category, a cap that is not a positive whole number and a zero ceiling', () => {
    const good = {
      note: 'team rule',
      max_consumer_quantity: { e_bike: 2, laptop: 2, farm_machine: 1 },
      consumer_manual_review: { e_bike: false, laptop: false, farm_machine: true },
      income_ceiling_cents: 10_000_000,
    };
    expect(consumerLimitsSchema.safeParse(good).success).toBe(true);
    const bad = [
      { ...good, max_consumer_quantity: { e_bike: 2, laptop: 2 } },
      { ...good, max_consumer_quantity: { ...good.max_consumer_quantity, boat: 1 } },
      { ...good, max_consumer_quantity: { ...good.max_consumer_quantity, laptop: 0 } },
      { ...good, max_consumer_quantity: { ...good.max_consumer_quantity, laptop: 1.5 } },
      { ...good, income_ceiling_cents: 0 },
      { ...good, extra: true },
    ];
    for (const value of bad) expect(consumerLimitsSchema.safeParse(value).success).toBe(false);
  });
});

describe('data pack rules enforced by the schemas', () => {
  it('rejects overlapping price lists', () => {
    const list = { note: '', prices: {} };
    const result = priceListsFileSchema.safeParse([
      { ...list, version: 1, valid_from: '2026-01-01', valid_to: '2026-06-30' },
      { ...list, version: 2, valid_from: '2026-06-30', valid_to: null },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a coefficient table with a gap between bands', async () => {
    const table = await loadCoefficientTable();
    const [first, second, ...rest] = table.bands;
    if (!first || !second) throw new Error('expected at least two bands');
    const withGap = {
      ...table,
      bands: [first, { ...second, min_financed_cents: second.min_financed_cents + 1 }, ...rest],
    };
    expect(coefficientTableSchema.safeParse(withGap).success).toBe(false);
  });
});
