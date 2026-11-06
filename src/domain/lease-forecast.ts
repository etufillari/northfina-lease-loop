// The dealer's forecast: which leases end soon, so the dealer can prepare for the items that
// come back. A forecast is an expectation (the lease's last day), not a confirmed return.
//
// Everything here is pure: the caller passes "today" and the leases in. Dates are ISO
// (`YYYY-MM-DD`); day arithmetic uses integers only, so it never depends on a time zone.
import { addMonthsClamped, assertIsoDate, daysInMonth } from './calendar';

export type ForecastRange = { from: string; to: string };

export type ForecastPreset = 'this_month' | 'next_month' | 'next_three_months';
export const FORECAST_PRESETS: readonly ForecastPreset[] = [
  'this_month',
  'next_month',
  'next_three_months',
];

/** The widest range a dealer can ask for; longer ranges are refused, not silently cut. */
export const MAX_RANGE_DAYS = 731;

/** Leases ending within this many days (inclusive) count as "ending soon". */
export const ENDING_SOON_DAYS = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(isoDate: string): { year: number; month: number; day: number } {
  assertIsoDate(isoDate);
  const [year = 0, month = 0, day = 0] = (ISO_DATE.exec(isoDate) ?? []).slice(1).map(Number);
  return { year, month, day };
}

/** Days since 1970-01-01 (proleptic Gregorian). Integer maths only, no `Date`. */
function dayNumber(isoDate: string): number {
  const { year, month, day } = parts(isoDate);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Whole days from `fromIso` to `toIso`. Negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

function monthStart(isoDate: string): string {
  const { year, month } = parts(isoDate);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function monthEnd(isoDate: string): string {
  const { year, month } = parts(isoDate);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

/**
 * The calendar range of a preset, relative to `today`:
 * - `this_month`: the 1st to the last day of today's month;
 * - `next_month`: the whole month after today's (the default view; the wildcard's "next month");
 * - `next_three_months`: from the 1st of next month to the end of the third month from now.
 */
export function presetRange(today: string, preset: ForecastPreset): ForecastRange {
  const thisMonth = monthStart(today);
  switch (preset) {
    case 'this_month':
      return { from: thisMonth, to: monthEnd(thisMonth) };
    case 'next_month': {
      const next = addMonthsClamped(thisMonth, 1);
      return { from: next, to: monthEnd(next) };
    }
    case 'next_three_months': {
      const next = addMonthsClamped(thisMonth, 1);
      return { from: next, to: monthEnd(addMonthsClamped(next, 2)) };
    }
  }
}

export type RangeResult =
  | { ok: true; range: ForecastRange; preset: ForecastPreset | null }
  | { ok: false; reason: 'invalid_date' | 'incomplete_range' | 'from_after_to' | 'range_too_long' };

/**
 * The range to show. With no dates it is next month. With dates, both are needed and must be
 * real days in order, at most two years apart. Anything else is a value the UI can explain,
 * not an exception: it comes straight from a URL a person may have edited.
 */
export function resolveForecastRange(
  today: string,
  input: { from?: string | undefined; to?: string | undefined } = {}
): RangeResult {
  const { from, to } = input;
  if (!from && !to) {
    return { ok: true, range: presetRange(today, 'next_month'), preset: 'next_month' };
  }
  if (!from || !to) return { ok: false, reason: 'incomplete_range' };

  try {
    assertIsoDate(from);
    assertIsoDate(to);
  } catch {
    return { ok: false, reason: 'invalid_date' };
  }
  if (from > to) return { ok: false, reason: 'from_after_to' };
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return { ok: false, reason: 'range_too_long' };

  const preset = FORECAST_PRESETS.find((name) => {
    const range = presetRange(today, name);
    return range.from === from && range.to === to;
  });
  return { ok: true, range: { from, to }, preset: preset ?? null };
}

export type ForecastCategory = 'e_bike' | 'laptop' | 'farm_machine';

/** One active lease, already joined with the asset and any return request by the caller. */
export type ForecastLease = {
  contractId: string;
  assetId: string;
  category: ForecastCategory;
  customerId: string;
  /** The last day the lease covers: the expected return day. */
  endDate: string;
  /** The return request for this lease that is still being worked on, if the customer made one. */
  openReturn: { id: string; status: string } | null;
};

/** `overdue`: the lease already ended but the item is still out. `soon`: ends within a week. */
export type ForecastPhase = 'overdue' | 'soon' | 'upcoming';

export type ForecastEntry = ForecastLease & {
  /** Negative when the lease already ended. */
  daysUntilEnd: number;
  phase: ForecastPhase;
};

export type ForecastSummary = {
  total: number;
  byCategory: Record<ForecastCategory, number>;
  returnRequested: number;
  noReturnYet: number;
  endingSoon: number;
  overdue: number;
};

export type Forecast = { range: ForecastRange; entries: ForecastEntry[]; summary: ForecastSummary };

function phaseOf(daysUntilEnd: number): ForecastPhase {
  if (daysUntilEnd < 0) return 'overdue';
  return daysUntilEnd <= ENDING_SOON_DAYS ? 'soon' : 'upcoming';
}

/**
 * The leases that end inside `range` (both days included), soonest first, with how many days
 * are left and a summary. Ties on the end date are ordered by asset id so the list never
 * reshuffles between two visits.
 */
export function buildForecast(input: {
  today: string;
  range: ForecastRange;
  leases: readonly ForecastLease[];
}): Forecast {
  const { today, range } = input;

  const entries = input.leases
    .filter((lease) => lease.endDate >= range.from && lease.endDate <= range.to)
    .map((lease): ForecastEntry => {
      const daysUntilEnd = daysBetween(today, lease.endDate);
      return { ...lease, daysUntilEnd, phase: phaseOf(daysUntilEnd) };
    })
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate) ||
        a.assetId.localeCompare(b.assetId) ||
        a.contractId.localeCompare(b.contractId)
    );

  const summary: ForecastSummary = {
    total: entries.length,
    byCategory: { e_bike: 0, laptop: 0, farm_machine: 0 },
    returnRequested: 0,
    noReturnYet: 0,
    endingSoon: 0,
    overdue: 0,
  };
  for (const entry of entries) {
    summary.byCategory[entry.category] += 1;
    if (entry.openReturn) summary.returnRequested += 1;
    else summary.noReturnYet += 1;
    if (entry.phase === 'soon') summary.endingSoon += 1;
    if (entry.phase === 'overdue') summary.overdue += 1;
  }

  return { range, entries, summary };
}
