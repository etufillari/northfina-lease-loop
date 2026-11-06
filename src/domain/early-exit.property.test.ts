// Property tests for the fair early exit (Smart Problem 2), split from early-exit.test.ts
// to keep each file under 600 lines. Example-based tests stay in early-exit.test.ts.
import * as hegel from '@hegeldev/hegel';
import * as gs from '@hegeldev/hegel/generators';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import type {
  AssetCategory,
  AssetCondition,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  UsageUnit,
  VatRates,
} from '@/data/schemas';
import {
  billedMonthsAsOf,
  calculateEarlyExit,
  earlyExitForContract,
  outstandingBalanceCents,
} from './early-exit';
import { availableTermsFromTable, calculateContractQuote } from './contract-pricing';
import { addMonthsClamped, daysInMonth } from './invoice-schedule';

describe('early-exit property tests (Hegel: Fair early exit)', () => {
  let coefficientTable: CoefficientTable;
  let refurbishmentCosts: RefurbishmentCosts;
  let residualCurves: ResidualCurves;
  let vatRates: VatRates;

  beforeAll(async () => {
    [coefficientTable, refurbishmentCosts, residualCurves, vatRates] = await Promise.all([
      loadCoefficientTable(),
      loadRefurbishmentCosts(),
      loadResidualCurves(),
      loadVatRates(),
    ]);
  });

  const validIsoDateGen = gs.composite<string>((tc) => {
    const year = tc.draw(gs.integers({ minValue: 2025, maxValue: 2029 }));
    const month = tc.draw(gs.integers({ minValue: 1, maxValue: 12 }));
    const maxDay = daysInMonth(year, month);
    const day = tc.draw(gs.integers({ minValue: 1, maxValue: maxDay }));
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  });

  const assetDetailsGen = gs.composite<{
    category: AssetCategory;
    condition: AssetCondition;
    usage: { unit: UsageUnit; value: number };
    usageAtStartValue: number;
  }>((tc) => {
    const category = tc.draw(gs.sampledFrom<AssetCategory>(['e_bike', 'laptop', 'farm_machine']));
    const condition = tc.draw(
      gs.sampledFrom<AssetCondition>(['new', 'like_new', 'good', 'fair', 'poor'])
    );
    const unit: UsageUnit =
      category === 'e_bike' ? 'km' : category === 'laptop' ? 'battery_cycles' : 'engine_hours';
    const usageAtStartValue = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
    const additionalUsage = tc.draw(gs.integers({ minValue: 0, maxValue: 40_000 }));
    const value = usageAtStartValue + additionalUsage;
    return { category, condition, usage: { unit, value }, usageAtStartValue };
  });

  it('property: billedMonthsAsOf is monotonic, stays within [0, termMonths], and matches installment dates', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const m1 = tc.draw(gs.integers({ minValue: 0, maxValue: 100 }));
        const m2 = tc.draw(gs.integers({ minValue: m1, maxValue: 100 }));

        const asOf1 = addMonthsClamped(signedOn, m1);
        const asOf2 = addMonthsClamped(signedOn, m2);

        const billed1 = billedMonthsAsOf(signedOn, termMonths, asOf1);
        const billed2 = billedMonthsAsOf(signedOn, termMonths, asOf2);

        expect(billed1).toBeGreaterThanOrEqual(0);
        expect(billed1).toBeLessThanOrEqual(termMonths);
        expect(billed2).toBeGreaterThanOrEqual(0);
        expect(billed2).toBeLessThanOrEqual(termMonths);
        expect(billed2).toBeGreaterThanOrEqual(billed1);

        // Exact due date property
        const step = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths - 1 }));
        const onDueDate = addMonthsClamped(signedOn, step);
        expect(billedMonthsAsOf(signedOn, termMonths, onDueDate)).toBe(step + 1);

        // Day before signing
        expect(billedMonthsAsOf(signedOn, termMonths, '2024-01-01')).toBe(0);
        // Far future date
        expect(billedMonthsAsOf(signedOn, termMonths, '2099-12-31')).toBe(termMonths);
      },
      { testCases: 200 }
    ));

  it('property: outstandingBalanceCents satisfies boundary conditions, monotonicity in months, and safe integer math', () =>
    hegel.test(
      (tc) => {
        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const annualRateBp = tc.draw(gs.integers({ minValue: 0, maxValue: 3000 }));
        const annualInterestPercent = annualRateBp / 100;
        const remainingMonths = tc.draw(gs.integers({ minValue: 0, maxValue: 84 }));

        const balance = outstandingBalanceCents({
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent,
          remainingMonths,
        });

        expect(Number.isSafeInteger(balance)).toBe(true);
        expect(balance).toBeGreaterThanOrEqual(0);

        // Boundary: 0 remaining months is exactly the buyout
        if (remainingMonths === 0) {
          expect(balance).toBe(buyoutNetCents);
        }

        // Zero interest identity: plain undiscounted sum
        if (annualInterestPercent === 0) {
          expect(balance).toBe(monthlyNetRentCents * remainingMonths + buyoutNetCents);
        }

        // Positive interest rate discounting: balance <= nominal sum
        const nominalSum = monthlyNetRentCents * remainingMonths + buyoutNetCents;
        expect(balance).toBeLessThanOrEqual(nominalSum);
        if (annualInterestPercent >= 5 && remainingMonths >= 12 && monthlyNetRentCents >= 10_000) {
          expect(balance).toBeLessThan(nominalSum);
        }

        // Monotonicity in remaining months:
        // balance(m+1) - balance(m) = (rent - r * buyout) / (1 + r)^(m+1).
        // If rent >= r * buyout, then balance is non-decreasing in remaining months.
        if (remainingMonths < 84) {
          const nextBalance = outstandingBalanceCents({
            monthlyNetRentCents,
            buyoutNetCents,
            annualInterestPercent,
            remainingMonths: remainingMonths + 1,
          });
          const rentOverhead =
            BigInt(monthlyNetRentCents) * 120_000n - BigInt(annualRateBp) * BigInt(buyoutNetCents);
          if (rentOverhead >= 0n) {
            expect(nextBalance).toBeGreaterThanOrEqual(balance);
            if (rentOverhead >= 120_000n * 5_000n) {
              expect(nextBalance).toBeGreaterThan(balance);
            }
          } else if (rentOverhead < -120_000n * 5_000n) {
            expect(nextBalance).toBeLessThanOrEqual(balance);
          }
        }
      },
      { testCases: 200 }
    ));

  it('property: Money that adds up — line items reconcile with net, and net + VAT equals gross', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const elapsedMonths = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths + 12 }));
        const asOf = addMonthsClamped(signedOn, elapsedMonths);

        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const annualInterestPercent = tc.draw(
          gs.sampledFrom([0, 4.9, 5.9, 6.9, 7.9, 8.9, 9.9, 12.5])
        );
        const firstListPriceCents = tc.draw(gs.integers({ minValue: 1_000, maxValue: 50_000_000 }));
        const asset = tc.draw(assetDetailsGen);

        const quote = calculateEarlyExit({
          signedOn,
          asOf,
          termMonths,
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent,
          firstListPriceCents,
          category: asset.category,
          condition: asset.condition,
          usage: asset.usage,
          usageAtStartValue: asset.usageAtStartValue,
          refurbishmentRules: refurbishmentCosts[asset.category].fixed,
          residualCurves,
          vatRates,
        });

        // Billed + remaining partition
        expect(quote.billedMonths + quote.remainingMonths).toBe(termMonths);
        expect(quote.nominalRemainingRentsCents).toBe(monthlyNetRentCents * quote.remainingMonths);

        // Buyout option
        expect(quote.buyout.netCents).toBe(quote.balanceCents);
        const buyoutLineSum = quote.buyout.lines.reduce((s, l) => s + l.amountCents, 0);
        expect(buyoutLineSum).toBe(quote.buyout.netCents);
        expect(quote.buyout.settlement.grossCents).toBe(
          quote.buyout.netCents + quote.buyout.settlement.vatCents
        );
        expect(quote.buyout.settlement.vatCents).toBe(
          Math.round(quote.buyout.netCents * (quote.buyout.settlement.vatRatePercent / 100))
        );

        // Return option
        const returnLineSum = quote.returnItem.lines.reduce((s, l) => s + l.amountCents, 0);
        expect(returnLineSum).toBe(quote.returnItem.netCents);
        expect(quote.returnItem.settlement.grossCents).toBe(
          quote.returnItem.netCents + quote.returnItem.settlement.vatCents
        );
        expect(quote.returnItem.settlement.vatCents).toBe(
          Math.round(quote.returnItem.netCents * (quote.returnItem.settlement.vatRatePercent / 100))
        );

        // Invariant: all lines have safe integer amounts
        for (const line of [...quote.buyout.lines, ...quote.returnItem.lines]) {
          expect(Number.isSafeInteger(line.amountCents)).toBe(true);
        }
      },
      { testCases: 200 }
    ));

  it('property: fair early exit math — early return expenses are 0 if and only if return credit offsets balance', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 1, maxValue: 84 }));
        const elapsedMonths = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths + 6 }));
        const asOf = addMonthsClamped(signedOn, elapsedMonths);

        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 0, maxValue: 50_000_000 }));
        const annualInterestPercent = tc.draw(
          gs.sampledFrom([0, 4.9, 5.9, 6.9, 7.9, 8.9, 9.9, 12.5])
        );
        const firstListPriceCents = tc.draw(gs.integers({ minValue: 1_000, maxValue: 50_000_000 }));
        const asset = tc.draw(assetDetailsGen);

        const quote = calculateEarlyExit({
          signedOn,
          asOf,
          termMonths,
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent,
          firstListPriceCents,
          category: asset.category,
          condition: asset.condition,
          usage: asset.usage,
          usageAtStartValue: asset.usageAtStartValue,
          refurbishmentRules: refurbishmentCosts[asset.category].fixed,
          residualCurves,
          vatRates,
        });

        // 1. Return cost bounds
        expect(quote.returnItem.netCents).toBeGreaterThanOrEqual(0);
        expect(quote.returnItem.netCents).toBeLessThanOrEqual(quote.nominalRemainingRentsCents);
        expect(quote.returnItem.netCents).toBeLessThanOrEqual(quote.buyout.netCents);

        // 2. Exact early-exit expense condition:
        // A customer terminates without expenses (returnItem netCents = 0) if and only if
        // the return credit meets or exceeds the balance (or no rents remain).
        const rawReturn = quote.balanceCents - quote.returnCreditCents;
        if (rawReturn <= 0 || quote.remainingMonths === 0) {
          expect(quote.returnItem.netCents).toBe(0);
        } else {
          const expectedCost = Math.min(rawReturn, quote.nominalRemainingRentsCents);
          expect(quote.returnItem.netCents).toBe(expectedCost);
          if (expectedCost > 0) {
            expect(quote.returnItem.netCents).toBeGreaterThan(0);
          }
        }

        // 3. Buyout option never allows terminating without paying the balance
        if (quote.balanceCents > 0) {
          expect(quote.buyout.netCents).toBeGreaterThan(0);
        }
      },
      { testCases: 200 }
    ));

  it('property: asset condition and usage monotonicity — returning in worse condition or higher usage never decreases expenses', () =>
    hegel.test(
      (tc) => {
        const signedOn = tc.draw(validIsoDateGen);
        const termMonths = tc.draw(gs.integers({ minValue: 6, maxValue: 60 }));
        const elapsed = tc.draw(gs.integers({ minValue: 0, maxValue: termMonths - 1 }));
        const asOf = addMonthsClamped(signedOn, elapsed);
        const firstListPriceCents = tc.draw(
          gs.integers({ minValue: 100_000, maxValue: 10_000_000 })
        );
        const monthlyNetRentCents = tc.draw(gs.integers({ minValue: 5_000, maxValue: 500_000 }));
        const buyoutNetCents = tc.draw(gs.integers({ minValue: 10_000, maxValue: 1_000_000 }));
        const category = tc.draw(
          gs.sampledFrom<AssetCategory>(['e_bike', 'laptop', 'farm_machine'])
        );
        const unit: UsageUnit =
          category === 'e_bike' ? 'km' : category === 'laptop' ? 'battery_cycles' : 'engine_hours';
        const baseInput = {
          signedOn,
          asOf,
          termMonths,
          monthlyNetRentCents,
          buyoutNetCents,
          annualInterestPercent: 7.9,
          firstListPriceCents,
          category,
          usageAtStartValue: 0,
          refurbishmentRules: refurbishmentCosts[category].fixed,
          residualCurves,
          vatRates,
        };

        // Monotonicity across conditions: 'new' -> 'like_new' -> 'good' -> 'fair' -> 'poor'
        const conditionOrder: AssetCondition[] = ['new', 'like_new', 'good', 'fair', 'poor'];
        const i1 = tc.draw(gs.integers({ minValue: 0, maxValue: conditionOrder.length - 1 }));
        const i2 = tc.draw(gs.integers({ minValue: i1, maxValue: conditionOrder.length - 1 }));
        const c1 = conditionOrder[i1]!;
        const c2 = conditionOrder[i2]!;

        const q1 = calculateEarlyExit({
          ...baseInput,
          condition: c1,
          usage: { unit, value: 500 },
        });
        const q2 = calculateEarlyExit({
          ...baseInput,
          condition: c2,
          usage: { unit, value: 500 },
        });

        // Better condition has higher or equal market value
        expect(q1.marketValue.valueCents).toBeGreaterThanOrEqual(q2.marketValue.valueCents);
        // Worse condition has higher or equal return expenses
        expect(q2.returnItem.netCents).toBeGreaterThanOrEqual(q1.returnItem.netCents);

        // Monotonicity across usage
        const uVal1 = tc.draw(gs.integers({ minValue: 0, maxValue: 20_000 }));
        const uVal2 = tc.draw(gs.integers({ minValue: uVal1, maxValue: 50_000 }));
        const qUse1 = calculateEarlyExit({
          ...baseInput,
          condition: 'good',
          usage: { unit, value: uVal1 },
        });
        const qUse2 = calculateEarlyExit({
          ...baseInput,
          condition: 'good',
          usage: { unit, value: uVal2 },
        });

        // Holds across the battery threshold too: a usage-resetting step can only lower the
        // credit, so more usage never makes a return cheaper.
        expect(qUse1.returnCreditCents).toBeGreaterThanOrEqual(qUse2.returnCreditCents);
        expect(qUse2.returnItem.netCents).toBeGreaterThanOrEqual(qUse1.returnItem.netCents);
        if (qUse1.refurbishment.resetsUsage === qUse2.refurbishment.resetsUsage) {
          expect(qUse1.marketValue.valueCents).toBeGreaterThanOrEqual(qUse2.marketValue.valueCents);
        }
      },
      { testCases: 200 }
    ));

  it('property: earlyExitForContract prices contract timeline consistently, matching buyout at end of term', () =>
    hegel.test(
      (tc) => {
        const terms = availableTermsFromTable(coefficientTable);
        const termMonths = tc.draw(gs.sampledFrom(terms));
        const lowestFinanced = Math.min(...coefficientTable.bands.map((b) => b.min_financed_cents));
        const highestFinanced = Math.max(
          ...coefficientTable.bands.map((b) => b.max_financed_cents)
        );
        const financedCents = tc.draw(
          gs.integers({ minValue: lowestFinanced, maxValue: highestFinanced })
        );
        const downPaymentCents = tc.draw(gs.integers({ minValue: 0, maxValue: 5_000_000 }));
        const listPriceCents = financedCents + downPaymentCents;
        const signedOn = tc.draw(validIsoDateGen);

        const result = calculateContractQuote({
          listPriceCents,
          priceListVersion: 1,
          downPaymentCents,
          termMonths,
          isoDate: signedOn,
          coefficientTable,
          vatRates,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { quote } = result;
        const asset = tc.draw(assetDetailsGen);

        // Month 1 early exit
        const exitM1 = earlyExitForContract({
          quote,
          signedOn,
          exitMonth: 1,
          inspection: { condition: asset.condition, usageValue: asset.usage.value },
          asset: {
            category: asset.category,
            usage: { unit: asset.usage.unit, value: asset.usageAtStartValue },
          },
          refurbishmentCosts,
          residualCurves,
          vatRates,
        });

        expect(exitM1.billedMonths).toBe(1);
        expect(exitM1.remainingMonths).toBe(termMonths - 1);

        // If zero down payment and worn condition ('good', 'fair', 'poor'), month 1 exit requires expenses
        if (
          downPaymentCents === 0 &&
          ['good', 'fair', 'poor'].includes(asset.condition) &&
          termMonths >= 24
        ) {
          expect(exitM1.returnItem.netCents).toBeGreaterThan(0);
        }

        // Final month early exit equals end of term
        const exitFinal = earlyExitForContract({
          quote,
          signedOn,
          exitMonth: termMonths,
          inspection: { condition: asset.condition, usageValue: asset.usage.value },
          asset: {
            category: asset.category,
            usage: { unit: asset.usage.unit, value: asset.usageAtStartValue },
          },
          refurbishmentCosts,
          residualCurves,
          vatRates,
        });

        expect(exitFinal.billedMonths).toBe(termMonths);
        expect(exitFinal.remainingMonths).toBe(0);
        // Exiting at the end of the term: buyout equals contractual buyout
        expect(exitFinal.buyout.netCents).toBe(quote.buyoutNetCents);
        // Returning at the end of the term costs 0 net euros
        expect(exitFinal.returnItem.netCents).toBe(0);

        // Timeline progression: balance strictly decreases between month 1 and final month (if term > 1)
        if (termMonths > 1) {
          expect(exitM1.balanceCents).toBeGreaterThan(exitFinal.balanceCents);
        }
      },
      { testCases: 200 }
    ));
});
