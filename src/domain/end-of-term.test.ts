import { describe, expect, it } from 'vitest';
import {
  loadAssets,
  loadCo2Factors,
  loadCoefficientTable,
  loadPriceLists,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadVatRates,
} from '@/data/load';
import {
  avoidedCo2Grams,
  calculateAvoidedCo2,
  calculateBuyoutSettlement,
  calculateResidualMarketValue,
  deriveAssetSecondLifeValuation,
  evaluateSecondLifeCandidates,
  interpolateResidualCurve,
  matchSecondLifeWaitingList,
  rankWaitingList,
} from './end-of-term';

describe('calculateBuyoutSettlement', () => {
  it('calculates buyout with 25.5% VAT in 2026', async () => {
    const vatRates = await loadVatRates();
    const settlement = calculateBuyoutSettlement({
      buyoutNetCents: 58350,
      asOf: '2026-11-05',
      vatRates,
    });

    expect(settlement.buyoutNetCents).toBe(58350);
    expect(settlement.vatRatePercent).toBe(25.5);
    // 58350 * 0.255 = 14879.25 -> 14879
    expect(settlement.vatCents).toBe(14879);
    expect(settlement.grossCents).toBe(73229);
    expect(settlement.fictionalVat).toBe(false);
  });

  it('calculates buyout with 26% VAT in 2027 (Smart Problem #1 dynamic VAT)', async () => {
    const vatRates = await loadVatRates();
    const settlement = calculateBuyoutSettlement({
      buyoutNetCents: 58350,
      asOf: '2027-01-15',
      vatRates,
    });

    expect(settlement.buyoutNetCents).toBe(58350);
    expect(settlement.vatRatePercent).toBe(26);
    // 58350 * 0.26 = 15171
    expect(settlement.vatCents).toBe(15171);
    expect(settlement.grossCents).toBe(73521);
    expect(settlement.fictionalVat).toBe(true);
  });

  it('rejects non-integer or negative cents', async () => {
    const vatRates = await loadVatRates();
    expect(() =>
      calculateBuyoutSettlement({
        buyoutNetCents: 100.5,
        asOf: '2026-11-05',
        vatRates,
      })
    ).toThrow(RangeError);

    expect(() =>
      calculateBuyoutSettlement({
        buyoutNetCents: -500,
        asOf: '2026-11-05',
        vatRates,
      })
    ).toThrow(RangeError);
  });
});

describe('interpolateResidualCurve', () => {
  const samplePoints: readonly [number, number][] = [
    [0, 100],
    [12, 70],
    [24, 50],
  ];

  it('returns initial point for age 0 or below', () => {
    expect(interpolateResidualCurve(samplePoints, 0)).toBe(100);
  });

  it('interpolates linearly between points', () => {
    // midway between 0 (100%) and 12 (70%) is 6 (85%)
    expect(interpolateResidualCurve(samplePoints, 6)).toBe(85);
  });

  it('holds last value beyond the curve', () => {
    expect(interpolateResidualCurve(samplePoints, 36)).toBe(50);
    expect(interpolateResidualCurve(samplePoints, 100)).toBe(50);
  });

  it('rejects empty points or negative age', () => {
    expect(() => interpolateResidualCurve([], 10)).toThrow(RangeError);
    expect(() => interpolateResidualCurve(samplePoints, -1)).toThrow(RangeError);
  });
});

describe('calculateResidualMarketValue', () => {
  it('matches Card 9 reference numbers exactly (ebike-007 at 46 months)', async () => {
    const residualCurves = await loadResidualCurves();
    // Card 9 in ARCHITECTURE.md §9:
    // ebike-007, first list price 549000 (€5,490), age 46 months -> 32.5%,
    // fair condition -> 0.65, usage 18400 km -> -36% capped at -20% -> 0.8
    // Relist price = 92781 (€927.81)
    const relistPriceCents = calculateResidualMarketValue({
      firstListPriceCents: 549000,
      ageMonths: 46,
      category: 'e_bike',
      condition: 'fair',
      usage: { unit: 'km', value: 18400 },
      residualCurves,
    });

    expect(relistPriceCents).toBe(92781);
  });

  it('rounds an exact half up, where float math rounds it down', async () => {
    const residualCurves = await loadResidualCurves();
    // 34 375 × 100 % × 1.0 (new) × 0.94 (3 000 km = −6 %) = 32 312.5 exactly → 32 313.
    // In floating point the product is 32 312.4999…, so Math.round would give 32 312.
    const value = calculateResidualMarketValue({
      firstListPriceCents: 34_375,
      ageMonths: 0,
      category: 'e_bike',
      condition: 'new',
      usage: { unit: 'km', value: 3_000 },
      residualCurves,
    });
    expect(value).toBe(32_313);
  });

  it('matches card 8: ebike-003 at 7 months, good, 0 km → 264 520', async () => {
    const residualCurves = await loadResidualCurves();
    const value = calculateResidualMarketValue({
      firstListPriceCents: 389_000,
      ageMonths: 7,
      category: 'e_bike',
      condition: 'good',
      usage: { unit: 'km', value: 0 },
      residualCurves,
    });
    expect(value).toBe(264_520);
  });

  it('rejects invalid inputs', async () => {
    const residualCurves = await loadResidualCurves();
    expect(() =>
      calculateResidualMarketValue({
        firstListPriceCents: -1,
        ageMonths: 10,
        category: 'laptop',
        condition: 'good',
        usage: { unit: 'battery_cycles', value: 50 },
        residualCurves,
      })
    ).toThrow(RangeError);
  });
});

describe('matchSecondLifeWaitingList', () => {
  it('matches Card 9: wait-02 wins for ebike-007 (fair, relist 92781)', async () => {
    const demand = await loadSecondLifeDemand();
    const coefficientTable = await loadCoefficientTable();

    const matches = matchSecondLifeWaitingList({
      category: 'e_bike',
      condition: 'fair',
      relistPriceCents: 92781,
      demand,
      asOf: '2026-11-05',
      coefficientTable,
    });

    expect(matches.length).toBeGreaterThan(0);
    const topMatch = matches[0]!;
    // wait-13 needs 'good', so it is excluded. wait-02 accepts 'fair' and budget is 9000 cents.
    expect(topMatch.request.id).toBe('wait-02');
    expect(topMatch.monthlyNetRentCents).toBe(5198);
    expect(topMatch.rank).toBe(1);
  });

  it('filters out past deadlines and condition below min_condition', async () => {
    const demand = await loadSecondLifeDemand();
    const coefficientTable = await loadCoefficientTable();

    // Condition poor: nobody on waitlist accepts poor
    const poorMatches = matchSecondLifeWaitingList({
      category: 'e_bike',
      condition: 'poor',
      relistPriceCents: 92781,
      demand,
      asOf: '2026-11-05',
      coefficientTable,
    });
    expect(poorMatches).toHaveLength(0);

    // Date far in future: all deadlines passed
    const futureMatches = matchSecondLifeWaitingList({
      category: 'e_bike',
      condition: 'good',
      relistPriceCents: 92781,
      demand,
      asOf: '2030-01-01',
      coefficientTable,
    });
    expect(futureMatches).toHaveLength(0);
  });
});

describe('rankWaitingList', () => {
  const card9 = async (patch: object = {}) => ({
    category: 'e_bike' as const,
    condition: 'fair' as const,
    relistPriceCents: 92_781,
    demand: await loadSecondLifeDemand(),
    asOf: '2026-11-05',
    coefficientTable: await loadCoefficientTable(),
    ...patch,
  });
  const reasons = (excluded: { request: { id: string }; reason: string }[]) =>
    Object.fromEntries(excluded.map((e) => [e.request.id, e.reason]));

  it('card 9: wait-02 wins and every other e-bike entry says why it lost', async () => {
    const { candidates, excluded } = rankWaitingList(await card9());
    expect(candidates.map((c) => [c.request.id, c.monthlyNetRentCents, c.rank])).toEqual([
      ['wait-02', 5_198, 1],
    ]);
    expect(reasons(excluded)).toEqual({
      'wait-01': 'condition_too_low',
      'wait-03': 'condition_too_low',
      'wait-04': 'condition_too_low',
      'wait-05': 'condition_too_low',
      'wait-13': 'condition_too_low',
    });
  });

  it('a good item: over_budget when the rent at their term is above their budget', async () => {
    const { candidates, excluded } = rankWaitingList(await card9({ condition: 'good' }));
    // wait-05: 12 months → 5 198 > 3 500.
    expect(reasons(excluded)['wait-05']).toBe('over_budget');
    expect(candidates.map((c) => c.request.id)).toContain('wait-13');
  });

  it('deadline_passed once needed_by is before asOf', async () => {
    const { excluded } = rankWaitingList(await card9({ condition: 'good', asOf: '2026-11-15' }));
    expect(reasons(excluded)).toMatchObject({
      'wait-02': 'deadline_passed',
      'wait-05': 'deadline_passed',
      'wait-13': 'deadline_passed',
    });
  });

  it('ranks by earliest needed_by, then file order', async () => {
    const { candidates } = rankWaitingList(await card9({ condition: 'like_new' }));
    const ids = candidates.map((c) => c.request.id);
    // wait-02 and wait-13 share needed_by 2026-11-10: wait-02 signed up first.
    expect(ids.indexOf('wait-02')).toBeLessThan(ids.indexOf('wait-13'));
    expect(candidates.map((c) => c.rank)).toEqual(candidates.map((_, i) => i + 1));
  });

  it('excludes everyone with the band reason when the relist price cannot be leased', async () => {
    const { candidates, excluded } = rankWaitingList(
      await card9({ condition: 'like_new', relistPriceCents: 27_577 })
    );
    expect(candidates).toHaveLength(0);
    expect(new Set(excluded.map((e) => e.reason))).toEqual(new Set(['below_minimum']));
  });

  it('matchSecondLifeWaitingList returns the same candidates', async () => {
    const input = await card9();
    expect(matchSecondLifeWaitingList(input)).toEqual(rankWaitingList(input).candidates);
  });
});

describe('avoidedCo2Grams', () => {
  it('card 9: 165 kg × 0.88 × 92 781 / 549 000 = 24 538.8 g → 24 539 g', async () => {
    const co2Factors = await loadCo2Factors();
    expect(
      avoidedCo2Grams({
        category: 'e_bike',
        co2Factors,
        relistPriceCents: 92_781,
        firstListPriceCents: 549_000,
      })
    ).toBe(24_539);
  });

  it('is exact for a farm machine, where the product passes 2^53', async () => {
    const co2Factors = await loadCo2Factors();
    // 18 000 kg × 0.88 × 12 500 000 / 25 000 000 = 7 920 kg.
    expect(
      avoidedCo2Grams({
        category: 'farm_machine',
        co2Factors,
        relistPriceCents: 12_500_000,
        firstListPriceCents: 25_000_000,
      })
    ).toBe(7_920_000);
  });

  it('caps the value ratio at 1 and floors it at 5 %', async () => {
    const co2Factors = await loadCo2Factors();
    const grams = (relistPriceCents: number) =>
      avoidedCo2Grams({
        category: 'e_bike',
        co2Factors,
        relistPriceCents,
        firstListPriceCents: 100_000,
      });
    expect(grams(150_000)).toBe(145_200); // 165 kg × 0.88
    expect(grams(1_000)).toBe(7_260); // 5 % of 145.2 kg
  });

  it('is 0 without a first list price', async () => {
    const co2Factors = await loadCo2Factors();
    expect(
      avoidedCo2Grams({
        category: 'laptop',
        co2Factors,
        relistPriceCents: 1,
        firstListPriceCents: 0,
      })
    ).toBe(0);
  });
});

describe('calculateAvoidedCo2', () => {
  it('calculates avoided CO2 for e-bike', async () => {
    const co2Factors = await loadCo2Factors();
    // 165 kg manufacturing * (1 - 0.12) * (92781 / 549000) = 165 * 0.88 * 0.16900 = 24.5 kg
    const avoidedKg = calculateAvoidedCo2({
      category: 'e_bike',
      co2Factors,
      relistPriceCents: 92781,
      firstListPriceCents: 549000,
    });

    expect(avoidedKg).toBe(24.5);
  });

  it('handles zero or missing values safely', async () => {
    const co2Factors = await loadCo2Factors();
    expect(
      calculateAvoidedCo2({
        category: 'laptop',
        co2Factors,
        relistPriceCents: 50000,
        firstListPriceCents: 0,
      })
    ).toBe(0);
  });
});

describe('evaluateSecondLifeCandidates and deriveAssetSecondLifeValuation', () => {
  it('explains why wait-13 is excluded on Card 9 while wait-02 wins', async () => {
    const [assets, priceLists, residualCurves, coefficientTable, secondLifeDemand, co2Factors] =
      await Promise.all([
        loadAssets(),
        loadPriceLists(),
        loadResidualCurves(),
        loadCoefficientTable(),
        loadSecondLifeDemand(),
        loadCo2Factors(),
      ]);

    const ebike007 = assets.find((a) => a.id === 'ebike-007')!;
    const valuation = deriveAssetSecondLifeValuation({
      asset: ebike007,
      priceLists,
      residualCurves,
      coefficientTable,
      secondLifeDemand,
      co2Factors,
      asOf: '2026-11-05',
    });

    expect(valuation.ageMonths).toBe(46);
    expect(valuation.relistPriceCents).toBe(92_781);
    expect(valuation.canRelist).toBe(true);
    expect(valuation.matches[0]?.request.id).toBe('wait-02');
    expect(valuation.matches[0]?.monthlyNetRentCents).toBe(5198);
    expect(valuation.excluded.find((e) => e.request.id === 'wait-13')?.reason).toBe(
      'condition_too_low'
    );
  });

  it('marks laptop-006 as below_minimum because its relist value (27577) is under €300', async () => {
    const [assets, priceLists, residualCurves, coefficientTable, secondLifeDemand, co2Factors] =
      await Promise.all([
        loadAssets(),
        loadPriceLists(),
        loadResidualCurves(),
        loadCoefficientTable(),
        loadSecondLifeDemand(),
        loadCo2Factors(),
      ]);

    const laptop006 = assets.find((a) => a.id === 'laptop-006')!;
    const valuation = deriveAssetSecondLifeValuation({
      asset: laptop006,
      priceLists,
      residualCurves,
      coefficientTable,
      secondLifeDemand,
      co2Factors,
      asOf: '2026-11-05',
    });

    expect(valuation.relistPriceCents).toBe(27_577);
    expect(valuation.canRelist).toBe(false);
    expect(valuation.cannotRelistReason).toBe('below_minimum');
  });

  it('recalculates market value for a returned asset even if a previous-life relist_price_cents is present', async () => {
    const [assets, priceLists, residualCurves, coefficientTable, secondLifeDemand, co2Factors] =
      await Promise.all([
        loadAssets(),
        loadPriceLists(),
        loadResidualCurves(),
        loadCoefficientTable(),
        loadSecondLifeDemand(),
        loadCo2Factors(),
      ]);

    const ebike007 = assets.find((a) => a.id === 'ebike-007')!;
    const valuation = deriveAssetSecondLifeValuation({
      asset: { ...ebike007, status: 'returned', relist_price_cents: 250_000 },
      priceLists,
      residualCurves,
      coefficientTable,
      secondLifeDemand,
      co2Factors,
      asOf: '2026-11-05',
    });

    expect(valuation.relistPriceCents).toBe(92_781);
  });

  it('validates ISO dates in monthsBetweenIso and reports excluded reasons', async () => {
    expect(monthsBetweenIso('2023-01-01', '2026-11-05')).toBe(46);
    expect(monthsBetweenIso('2026-11-05', '2023-01-01')).toBe(0);
    expect(() => monthsBetweenIso('bad', '2026-11-05')).toThrow(RangeError);
    expect(() => monthsBetweenIso('2026-11-05', 'bad')).toThrow(RangeError);

    const [demand, coefficientTable] = await Promise.all([
      loadSecondLifeDemand(),
      loadCoefficientTable(),
    ]);
    const evalOverBudget = evaluateSecondLifeCandidates({
      category: 'e_bike',
      condition: 'good',
      relistPriceCents: 900_000,
      demand,
      asOf: '2026-11-05',
      coefficientTable,
    });
    expect(evalOverBudget.excluded.some((e) => e.reason === 'over_budget')).toBe(true);
  });
});
