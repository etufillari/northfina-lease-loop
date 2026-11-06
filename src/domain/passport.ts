// The passport (problem 3's bonus): an item's history as lives, folded from its event log.
//
// The log is read in the order it was written (`AssetEvent.id`), never re-sorted by date:
// two events on one day keep their order. `leased` opens a life; `returned`, `bought` and
// `passed_on` close it; `assessed`, `refurbished` and `repriced` happen between lives and
// attach to the gap after the life they follow (or to `before`, ahead of the first lease).
// The data pack only counts the lives before the log (`previous_lives`); those come first as
// undated lives with the assumed months of `ASSUMED_PAST_LIFE_MONTHS`, marked estimated.
import type { Asset, AssetCategory } from '@/data/schemas';
import type { AssetEventKind } from './statuses';
import { ASSUMED_PAST_LIFE_MONTHS } from './second-life/co2';

/** One row of the event log as the passport reads it. */
export type PassportEvent = {
  id: number;
  kind: AssetEventKind;
  /** ISO day. */
  on_date: string;
  contract_id: string | null;
  details: unknown;
};

/** How a life ended: the event that closed it, or null (open, or cut by the next lease). */
export type LifeEnd = 'returned' | 'bought' | 'passed_on';

export type Life = {
  /** 0 for the first life. */
  index: number;
  /** ISO day, or null for a past life the data pack only counts. */
  start: string | null;
  /** ISO day, inclusive; null while the life is open or when unknown. */
  end: string | null;
  contractId: string | null;
  /** Whole months; for an open life up to `asOf`; null when not known. */
  months: number | null;
  endKind: LifeEnd | null;
  /** True for a past life whose months are the assumption, not the log. */
  estimated: boolean;
  /** The assessments, refurbishments and re-pricings after this life, before the next. */
  between: PassportEvent[];
};

export type Lives = { before: PassportEvent[]; lives: Life[] };

export type Passport = Lives & { assetId: string; category: AssetCategory };

const CLOSING: readonly AssetEventKind[] = ['returned', 'bought', 'passed_on'];

// ---------- whole months on ISO days, no Date ----------

const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) =>
  [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

/** `start` plus `k` months, the day clamped to the end of a shorter month (31 Jan + 1 → 28 Feb). */
function addMonths(start: string, k: number): string {
  const { y, m, d } = parts(start);
  const index = y * 12 + (m - 1) + k;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return iso(year, month, Math.min(d, daysInMonth(year, month)));
}

function nextDay(day: string): string {
  const { y, m, d } = parts(day);
  if (d < daysInMonth(y, m)) return iso(y, m, d + 1);
  return m < 12 ? iso(y, m + 1, 1) : iso(y + 1, 1, 1);
}

/**
 * Whole months from `start` to `endInclusive`, counted like the invoice schedule: the start day
 * to the day before the same day next month is one month. A part month does not count.
 * ISO days compare correctly as strings.
 */
export function wholeMonths(start: string, endInclusive: string): number {
  if (endInclusive < start) return 0;
  const after = nextDay(endInclusive);
  const s = parts(start);
  const a = parts(after);
  const months = (a.y - s.y) * 12 + (a.m - s.m);
  return addMonths(start, months) <= after ? months : months - 1;
}

// ---------- the fold ----------

/** Folds an ordered event log into lives. `asOf` (ISO day) counts an open life's months so far. */
export function livesFromEvents(events: readonly PassportEvent[], asOf?: string): Lives {
  const before: PassportEvent[] = [];
  const lives: Life[] = [];
  let open: Life | null = null;

  const close = (life: Life, end: string, endKind: LifeEnd | null) => {
    life.end = end;
    life.endKind = endKind;
    life.months = wholeMonths(life.start!, end);
  };
  const gap = () => lives.at(-1)?.between ?? before;

  for (const event of events) {
    if (event.kind === 'leased') {
      if (open) close(open, event.on_date, null);
      open = {
        index: lives.length,
        start: event.on_date,
        end: null,
        contractId: event.contract_id,
        months: null,
        endKind: null,
        estimated: false,
        between: [],
      };
      lives.push(open);
    } else if (CLOSING.includes(event.kind) && open) {
      close(open, event.on_date, event.kind as LifeEnd);
      open = null;
    } else {
      gap().push(event);
    }
  }

  if (open && asOf !== undefined) open.months = wholeMonths(open.start!, asOf);
  return { before, lives };
}

/** The asset's passport: its counted past lives first, then the lives of its event log. */
export function passportFor(
  asset: Asset,
  events: readonly PassportEvent[],
  asOf?: string
): Passport {
  const past: Life[] = Array.from({ length: asset.previous_lives }, (_, index) => ({
    index,
    start: null,
    end: null,
    contractId: null,
    months: ASSUMED_PAST_LIFE_MONTHS,
    endKind: null,
    estimated: true,
    between: [],
  }));
  const logged = livesFromEvents(events, asOf);
  const lives = [
    ...past,
    ...logged.lives.map((life) => ({ ...life, index: life.index + past.length })),
  ];
  // Events ahead of the first logged lease happened after the past lives.
  const lastPast = past.at(-1);
  if (lastPast) lastPast.between = logged.before;
  return {
    assetId: asset.id,
    category: asset.category,
    before: lastPast ? [] : logged.before,
    lives,
  };
}
