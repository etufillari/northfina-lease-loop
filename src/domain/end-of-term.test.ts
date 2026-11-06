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
  calculateAvoidedCo2,
  calculateBuyoutSettlement,
  calculateResidualMarketValue,
  deriveAssetSecondLifeValuation,
  evaluateSecondLifeCandidates,
  interpolateResidualCurve,
  matchSecondLifeWaitingList,
  monthsBetweenIso,
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
