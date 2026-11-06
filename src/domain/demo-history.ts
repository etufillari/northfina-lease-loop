import type { AssetCategory, CoefficientTable, PriceList, VatRate } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { monthsEnding } from './company-metrics';
import {
  dueDateForMonth,
  forecastInvoices,
  quoteAmounts,
  type ForecastInvoice,
} from './lease-billing';
import { settlementQuote } from './lease-settlement';
import { listPriceOn } from './price-list';

/**
 * A believable but simulated trading history, planned as ordinary contracts and invoices so the
 * admin charts read recorded rows rather than made-up points. Everything derives from the same
 * pricing, billing and settlement functions real leases use, with no randomness: the same inputs
 * always give the same history.
 */
export type HistoryCatalogueItem = {
  /** The data-pack item whose model and price this fleet item copies. */
  id: string;
  category: AssetCategory;
  make: string;
  model: string;
  usageUnit: string;
};

export type PlannedInvoice = ForecastInvoice & { paid: boolean };
export type PlannedLease = {
  sequence: number;
  category: AssetCategory;
  source: HistoryCatalogueItem;
  startDate: string;
  termMonths: number;
  listPriceCents: number;
  downPaymentCents: number;
  monthlyNetCents: number;
  buyoutCents: number;
  annualRateBasisPoints: number;
  /** 0 marks a price from before the data pack's first price list. */
  priceListVersion: number;
  status: 'active' | 'completed' | 'returned' | 'bought';
  endedOn: string | null;
  usageValue: number;
  invoices: PlannedInvoice[];
  buyout: { date: string; totalCents: number; netCents: number; quote: unknown } | null;
};

/** Signings per month at full maturity, before seasonality. */
const monthlyDemand: Record<AssetCategory, number> = { e_bike: 6, laptop: 7, farm_machine: 0.8 };
/** Relative demand by calendar month, January first: spring bikes, autumn laptops, spring machinery. */
const seasonality: Record<AssetCategory, readonly number[]> = {
  e_bike: [0.5, 0.6, 1, 1.5, 1.7, 1.4, 1.1, 1, 1, 0.8, 0.5, 0.4],
  laptop: [1.1, 0.8, 0.8, 0.7, 0.7, 0.7, 0.8, 1.5, 1.6, 1, 0.9, 0.9],
  farm_machine: [0.6, 1, 1.8, 2, 1.2, 0.8, 0.7, 0.7, 0.8, 0.6, 0.4, 0.4],
};
/** The business grows from this share of its mature volume at the start of the history. */
const openingVolume = 0.35;
const termCycle: Record<AssetCategory, readonly number[]> = {
  e_bike: [36, 24, 36, 48, 12],
  laptop: [24, 36, 24, 12, 36],
  farm_machine: [48, 60, 36, 48],
};
const monthlyUsage: Record<AssetCategory, number> = { e_bike: 180, laptop: 18, farm_machine: 45 };
/** The largest machines would make one signing dominate the demo, so history leaves them out. */
const maxHistoryPriceCents = 10_000_000;

function monthsBetween(start: string, end: string) {
  const months =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7));
  return Math.max(0, months);
}

function priceOn(lists: readonly PriceList[], id: string, date: string) {
  const listed = listPriceOn(lists, id, date);
  if (listed.ok) return { priceCents: listed.priceCents, version: listed.priceListVersion };
  const earliest = [...lists].sort((a, b) => a.version - b.version)[0]?.prices[id];
  return earliest === undefined ? null : { priceCents: earliest, version: 0 };
}

export function planDemoHistory(input: {
  today: string;
  months: number;
  catalogue: readonly HistoryCatalogueItem[];
  priceLists: readonly PriceList[];
  table: CoefficientTable;
  rates: readonly VatRate[];
}): PlannedLease[] {
  const { today, months, table, rates, priceLists } = input;
  const items = (category: AssetCategory) =>
    input.catalogue.filter((item) => {
      if (item.category !== category) return false;
      const price = priceOn(priceLists, item.id, today);
      return (
        price !== null &&
        price.priceCents <= maxHistoryPriceCents &&
        monthlyFactorFor(table, price.priceCents, 36).ok
      );
    });
  const pools = {
    e_bike: items('e_bike'),
    laptop: items('laptop'),
    farm_machine: items('farm_machine'),
  };
  const carried: Record<AssetCategory, number> = { e_bike: 0, laptop: 0, farm_machine: 0 };
  const plan: PlannedLease[] = [];
  let sequence = 0;

  monthsEnding(today, months).forEach((month, position) => {
    const maturity = openingVolume + ((1 - openingVolume) * position) / Math.max(1, months - 1);
    const calendarMonth = Number(month.slice(5, 7)) - 1;
    for (const category of ['e_bike', 'laptop', 'farm_machine'] as const) {
      // Carrying the fraction makes small volumes add up, so farm machines still appear.
      const wanted =
        carried[category] +
        monthlyDemand[category] * seasonality[category][calendarMonth]! * maturity;
      const signings = Math.floor(wanted);
      carried[category] = wanted - signings;
      const pool = pools[category];
      if (!pool.length) continue;
      for (let signing = 0; signing < signings; signing++) {
        sequence++;
        const startDate = `${month}-${String(1 + ((sequence * 7) % 27)).padStart(2, '0')}`;
        if (startDate > today) continue;
        const source = pool[sequence % pool.length]!;
        const lease = planLease({
          sequence,
          category,
          source,
          startDate,
          today,
          table,
          rates,
          priceLists,
        });
        if (lease) plan.push(lease);
      }
    }
  });
  return plan;
}

function planLease(input: {
  sequence: number;
  category: AssetCategory;
  source: HistoryCatalogueItem;
  startDate: string;
  today: string;
  table: CoefficientTable;
  rates: readonly VatRate[];
  priceLists: readonly PriceList[];
}): PlannedLease | null {
  const { sequence, category, source, startDate, today, table, rates, priceLists } = input;
  const price = priceOn(priceLists, source.id, startDate);
  if (!price) return null;
  const termMonths = termCycle[category][sequence % termCycle[category].length]!;
  // Roughly one lease in five pays 10 % down.
  const downPaymentCents = sequence % 5 === 0 ? Math.floor(price.priceCents / 1000) * 100 : 0;
  const financed = price.priceCents - downPaymentCents;
  const factor = monthlyFactorFor(table, financed, termMonths);
  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (!factor.ok || buyoutPercent === undefined) return null;
  const quote = quoteAmounts(financed, factor.factor, buyoutPercent);
  const schedule = forecastInvoices(startDate, termMonths, quote.monthlyNetCents, rates);
  if (!schedule.ok) return null;
  const annualRateBasisPoints = Math.round(factor.band.annual_interest_percent * 100);

  const contractualEnd = dueDateForMonth(startDate, termMonths);
  // Fixed intervals, not chance: about one lease in nine comes back early, one in thirteen is bought.
  const earlyReturn = sequence % 9 === 0 ? dueDateForMonth(startDate, 8 + (sequence % 7)) : null;
  const earlyBuyout = sequence % 13 === 0 ? dueDateForMonth(startDate, 10 + (sequence % 5)) : null;
  let status: PlannedLease['status'] = 'active';
  let endedOn: string | null = null;
  if (earlyBuyout && earlyBuyout < contractualEnd && earlyBuyout <= today) {
    status = 'bought';
    endedOn = earlyBuyout;
  } else if (earlyReturn && earlyReturn < contractualEnd && earlyReturn <= today) {
    status = 'returned';
    endedOn = earlyReturn;
  } else if (contractualEnd <= today) {
    status = 'completed';
    endedOn = contractualEnd;
  }

  const lastBilled = endedOn ?? today;
  const billed = schedule.invoices.filter(
    (invoice) => invoice.dueDate <= today && invoice.dueDate < (endedOn ?? '9999-12-31')
  );
  // Arrears exist: about one active lease in eleven has not paid its latest invoice.
  const invoices = billed.map((invoice, index) => ({
    ...invoice,
    paid: !(status === 'active' && sequence % 11 === 0 && index === billed.length - 1),
  }));

  let buyout: PlannedLease['buyout'] = null;
  if (status === 'bought') {
    const rate = rates.find(
      (item) =>
        item.valid_from <= lastBilled && (item.valid_to === null || item.valid_to >= lastBilled)
    );
    if (!rate) return null;
    const settlement = settlementQuote({
      monthlyNetCents: quote.monthlyNetCents,
      buyoutCents: quote.buyoutCents,
      remainingMonths: termMonths - billed.length,
      annualRateBasisPoints,
      recoveryCents: 0,
      vatBasisPoints: Math.round(rate.rate_percent * 100),
      outstandingCents: 0,
    });
    buyout = {
      date: lastBilled,
      totalCents: settlement.buyoutTotalCents,
      netCents: settlement.buyoutNetCents,
      quote: { ...settlement, quoteDate: lastBilled },
    };
  }

  return {
    sequence,
    category,
    source,
    startDate,
    termMonths,
    listPriceCents: price.priceCents,
    downPaymentCents,
    ...quote,
    annualRateBasisPoints,
    priceListVersion: price.version,
    status,
    endedOn,
    usageValue: monthsBetween(startDate, lastBilled) * monthlyUsage[category],
    invoices,
    buyout,
  };
}
