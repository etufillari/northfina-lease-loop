import { assetCategorySchema, type AssetCategory } from '@/data/schemas';
import { dueDateForMonth } from './lease-billing';

export type MetricsContract = {
  category: AssetCategory;
  startDate: string;
  termMonths: number;
  status: string;
  endedOn: string | null;
  downPaymentCents: number;
  /** Issued rent invoices only. A forecast is not revenue. */
  invoices: readonly { dueDate: string; netCents: number }[];
  /** Recorded buyout settlements, net of VAT. */
  buyouts: readonly { date: string; netCents: number }[];
};

export const metricCategories = assetCategorySchema.options;
export type CategorySeries = Record<AssetCategory, number[]> & { total: number[] };

function emptySeries(length: number): CategorySeries {
  const zeros = () => Array.from({ length }, () => 0);
  return { total: zeros(), e_bike: zeros(), laptop: zeros(), farm_machine: zeros() };
}

/** The months ending with today's, oldest first, as `YYYY-MM`. */
export function monthsEnding(today: string, count: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(count) || count < 1)
    throw new RangeError('Invalid reporting range');
  const absolute = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, index) => {
    const value = absolute - count + 1 + index;
    const month = String((value % 12) + 1).padStart(2, '0');
    return `${String(Math.floor(value / 12)).padStart(4, '0')}-${month}`;
  });
}

/**
 * The date a lease stopped running. Older rows have no recorded date, so an ended lease falls back
 * to its contractual end. A lease still marked active keeps running past its term until it is closed.
 */
function endDate(contract: MetricsContract): string | null {
  if (contract.status === 'active') return null;
  return contract.endedOn ?? dueDateForMonth(contract.startDate, contract.termMonths);
}

/**
 * Monthly company figures from recorded data.
 * Revenue is net of VAT: issued rent invoices by due month, down payments by start month and
 * recorded buyouts by payment month. Unpaid invoices count, because revenue is earned when
 * invoiced; forecasts and return settlements with no recorded payment do not.
 * Active leases are counted at each month's end, or today for the current month.
 */
export function companyMetrics(
  contracts: readonly MetricsContract[],
  today: string,
  monthCount = 24
) {
  const months = monthsEnding(today, monthCount);
  const index = new Map(months.map((month, position) => [month, position]));
  const revenueCents = emptySeries(monthCount);
  const activeLeases = emptySeries(monthCount);
  const newLeases = emptySeries(monthCount);
  const add = (series: CategorySeries, category: AssetCategory, date: string, amount: number) => {
    if (date > today) return;
    const position = index.get(date.slice(0, 7));
    if (position === undefined) return;
    series.total[position]! += amount;
    series[category][position]! += amount;
  };

  for (const contract of contracts) {
    const { category } = contract;
    add(newLeases, category, contract.startDate, 1);
    add(revenueCents, category, contract.startDate, contract.downPaymentCents);
    for (const invoice of contract.invoices)
      add(revenueCents, category, invoice.dueDate, invoice.netCents);
    for (const buyout of contract.buyouts)
      add(revenueCents, category, buyout.date, buyout.netCents);

    const ended = endDate(contract);
    months.forEach((month, position) => {
      // Any day in a month sorts at or before `-31`, so this works for every month length.
      const point = position === monthCount - 1 ? today : `${month}-31`;
      if (contract.startDate <= point && (ended === null || ended > point)) {
        activeLeases.total[position]! += 1;
        activeLeases[category][position]! += 1;
      }
    });
  }

  const lastFull = monthCount - 2;
  const trailing = (series: number[]) =>
    series.slice(Math.max(0, lastFull - 11), lastFull + 1).reduce((sum, value) => sum + value, 0);
  const categoryRevenue = metricCategories.map((category) => ({
    category,
    revenueCents: trailing(revenueCents[category]),
  }));
  const top = categoryRevenue.reduce((best, item) =>
    item.revenueCents > best.revenueCents ? item : best
  );
  const allRevenue = trailing(revenueCents.total);

  return {
    months,
    revenueCents,
    activeLeases,
    newLeases,
    summary: {
      /** Absent when there is only the current, incomplete month to report. */
      lastFullMonth: lastFull >= 0 ? months[lastFull]! : null,
      lastFullMonthRevenueCents: lastFull >= 0 ? revenueCents.total[lastFull]! : 0,
      previousMonthRevenueCents: lastFull >= 1 ? revenueCents.total[lastFull - 1]! : 0,
      activeNow: activeLeases.total[monthCount - 1]!,
      newThisMonth: newLeases.total[monthCount - 1]!,
      topCategory: allRevenue > 0 ? top.category : null,
      /** Whole-number percentage, rounded half up, for display only. */
      topCategorySharePercent:
        allRevenue > 0 ? Math.floor((top.revenueCents * 100) / allRevenue + 0.5) : 0,
    },
  };
}
export type CompanyMetrics = ReturnType<typeof companyMetrics>;

/** Clean axis ticks from zero: each step is 1, 2, 2.5 or 5 times a power of ten. */
export function axisTicks(maxValue: number, wholeNumbersOnly = false, targetSteps = 4): number[] {
  if (!Number.isFinite(maxValue) || maxValue < 0 || targetSteps < 1)
    throw new RangeError('Invalid axis range');
  if (maxValue === 0) return [0, 1];
  const rough = maxValue / targetSteps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiplier = [1, 2, 2.5, 5, 10].find((option) => option * magnitude >= rough) ?? 10;
  let step = multiplier * magnitude;
  if (wholeNumbersOnly) step = Math.max(1, Math.ceil(step));
  const ticks: number[] = [];
  for (let tick = 0; tick < maxValue + step; tick += step) ticks.push(tick);
  return ticks;
}
