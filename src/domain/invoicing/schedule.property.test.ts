// Smart problem 5, "Money that adds up": the invariants of the schedule and the balance for
// random contracts priced from the real data pack (any asset, priced on any day of 2026, any
// term, any down payment below the price, any start date in 2025–2030).
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { Asset, CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { monthlyFactorFor } from '../coefficient';
import { applyMillionths, factorToMillionths, percentOf } from '../money-math';
import { listPriceOn } from '../price-list';
import { vatRateOn } from '../vat';
import { amortisationTolerance, outstandingBalanceAfter } from './balance';
import { addDays, daysInMonth, isLeapYear, isRealIsoDate, parseIsoDate } from './dates';
import { buildSchedule, scheduleTotals } from './schedule';

const NUM_RUNS = 2_000;
const TIMEOUT_MS = 60_000;
const DAY_MS = 86_400_000;
const TERMS = [12, 24, 36, 48] as const;

let assets: Asset[];
let priceLists: PriceList[];
let table: CoefficientTable;
let vatRates: VatRates;
beforeAll(async () => {
  [assets, priceLists, table, vatRates] = await Promise.all([
    loadAssets(),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
});

/** Any day from `from` to `to`, both included. */
const dayBetween = (from: string, to: string) => {
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return fc.integer({ min: 0, max: span }).map((offset) => addDays(from, offset));
};

/** A start date on the 29th, 30th or 31st of a month that has it. */
const monthEndStart = fc
  .record({
    year: fc.integer({ min: 2025, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 29, max: 31 }),
  })
  .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${day}`)
  .filter(isRealIsoDate);

const contractArb = fc.record({
  assetIndex: fc.nat(),
  pricedOn: dayBetween('2026-01-01', '2026-12-31'),
  termMonths: fc.constantFrom(...TERMS),
  downPaymentShare: fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
  startDate: fc.oneof(dayBetween('2025-01-01', '2030-12-31'), monthEndStart),
});

type Priced = {
  startDate: string;
  termMonths: number;
  downPaymentCents: number;
  financedCents: number;
  monthlyNetCents: number;
  buyoutCents: number;
  annualInterestPercent: number;
};

/** Prices a random contract the way signing will; null when the pack cannot finance it. */
type ContractSample = typeof contractArb extends fc.Arbitrary<infer T> ? T : never;

function price(sample: ContractSample): Priced | null {
  const asset = assets[sample.assetIndex % assets.length]!;
  const listed = listPriceOn(priceLists, asset.id, sample.pricedOn);
  if (!listed.ok) return null;
  const downPaymentCents = Math.floor(listed.priceCents * sample.downPaymentShare);
  const financedCents = listed.priceCents - downPaymentCents;
  const factor = monthlyFactorFor(table, financedCents, sample.termMonths);
  if (!factor.ok) return null;
  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(sample.termMonths)]!;
  return {
    startDate: sample.startDate,
    termMonths: sample.termMonths,
    downPaymentCents,
    financedCents,
    monthlyNetCents: applyMillionths(financedCents, factorToMillionths(factor.factor)),
    buyoutCents: percentOf(financedCents, buyoutPercent * 100),
    annualInterestPercent: factor.band.annual_interest_percent,
  };
}

function scheduleOf(contract: Priced) {
  const result = buildSchedule({ ...contract, signedOn: contract.startDate, vatRates });
  if (!result.ok) throw new Error(`no VAT rate on ${result.date}`);
  return result.invoices;
}

const run = (predicate: (contract: Priced) => void, arb = contractArb) =>
  fc.assert(
    fc.property(arb, (sample) => {
      const contract = price(sample);
      fc.pre(contract !== null);
      predicate(contract!);
    }),
    { numRuns: NUM_RUNS }
  );

describe('the schedule (property)', () => {
  it(
    'rent nets sum to term × monthly net exactly; gross = net + the per-line VAT',
    () => {
      run((contract) => {
        const invoices = scheduleOf(contract);
        const rents = invoices.filter((i) => i.kind === 'rent');
        expect(scheduleTotals(rents).netCents).toBe(contract.termMonths * contract.monthlyNetCents);
        const totals = scheduleTotals(invoices);
        expect(totals.netCents).toBe(
          contract.termMonths * contract.monthlyNetCents + contract.downPaymentCents
        );
        expect(totals.grossCents).toBe(
          totals.netCents + invoices.reduce((sum, i) => sum + i.vatCents, 0)
        );
        for (const invoice of invoices) {
          expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
        }
      });
    },
    TIMEOUT_MS
  );

  it(
    'every date is a real day, and periods are contiguous from the start to the term end',
    () => {
      run((contract) => {
        const rents = scheduleOf(contract).filter((i) => i.kind === 'rent');
        expect(rents[0]!.periodStart).toBe(contract.startDate);
        for (const [index, invoice] of rents.entries()) {
          for (const day of [
            invoice.issueDate,
            invoice.dueDate,
            invoice.periodStart!,
            invoice.periodEnd!,
          ]) {
            expect(isRealIsoDate(day), day).toBe(true);
          }
          expect(invoice.periodEnd! >= invoice.periodStart!).toBe(true);
          if (index > 0) expect(invoice.periodStart).toBe(addDays(rents[index - 1]!.periodEnd!, 1));
        }
      });
    },
    TIMEOUT_MS
  );

  it(
    'a start on the 29th–31st keeps its day or clamps to the month end; a leap February gives the 29th',
    () => {
      const monthEndContract = fc
        .tuple(contractArb, monthEndStart)
        .map(([sample, startDate]) => ({ ...sample, startDate }));
      run((contract) => {
        const startDay = parseIsoDate(contract.startDate).day;
        for (const invoice of scheduleOf(contract).filter((i) => i.kind === 'rent')) {
          const { year, month, day } = parseIsoDate(invoice.dueDate);
          expect(day).toBe(Math.min(startDay, daysInMonth(year, month)));
          if (month === 2 && isLeapYear(year)) expect(day).toBe(29);
        }
      }, monthEndContract);
    },
    TIMEOUT_MS
  );

  it(
    'sequences are 0 (only with a down payment) then 1 to term with no gaps',
    () => {
      run((contract) => {
        const sequences = scheduleOf(contract).map((i) => i.sequence);
        const rents = Array.from({ length: contract.termMonths }, (_, i) => i + 1);
        expect(sequences).toEqual(contract.downPaymentCents > 0 ? [0, ...rents] : rents);
      });
    },
    TIMEOUT_MS
  );

  it(
    'every invoice carries the VAT rate in force on its issue date',
    () => {
      run((contract) => {
        for (const invoice of scheduleOf(contract)) {
          const rate = vatRateOn(vatRates, invoice.issueDate);
          expect(rate.ok && rate.rateBasisPoints).toBe(invoice.vatRateBasisPoints);
        }
      });
    },
    TIMEOUT_MS
  );
});

describe('the balance (property, D14)', () => {
  it(
    'lands on the buyout at the end of the term within the rounding tolerance',
    () => {
      run((contract) => {
        const { driftCents } = outstandingBalanceAfter(contract, contract.termMonths);
        expect(Math.abs(driftCents)).toBeLessThanOrEqual(
          amortisationTolerance(contract.financedCents, contract.termMonths)
        );
      });
    },
    TIMEOUT_MS
  );
});
