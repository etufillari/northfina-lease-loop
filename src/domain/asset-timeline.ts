// An item's passport: every life it has had and every refurbishment, oldest first.
//
// Two sources. The data pack only says how many leases an item had before Lease Loop
// (`previous_lives`, no dates). Everything since is in our own records: each contract (who,
// from when to when, how it ended) and each refurbishment. So the earliest lives are counted,
// and the rest are told in full.
import type { Asset } from '@/data/schemas';
import { assetHistory, type LoopStage } from './asset-history';

export type TimelineContract = {
  startDate: string;
  endDate: string;
  /** active | returned | bought | passed_on */
  status: string;
  customerName: string;
  /** The day it was returned or passed on, or bought. */
  closedDate: string | null;
};

export type TimelineRefurbishment = {
  date: string;
  conditionBefore: string;
  conditionAfter: string;
  priceCents: number;
};

export type TimelineEntry =
  | { kind: 'earlier'; from: number; to: number }
  | ({ kind: 'lease'; number: number } & TimelineContract)
  | ({ kind: 'refurbished' } & TimelineRefurbishment)
  | { kind: 'next'; number: number; stage: LoopStage };

export function assetTimeline(
  asset: Asset,
  contracts: readonly TimelineContract[],
  refurbishments: readonly TimelineRefurbishment[],
  today: string
): TimelineEntry[] {
  const leases = [...contracts].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const closed = leases.filter((c) => c.status !== 'active').length;
  // Lives the data pack counted before our records start (never negative).
  const earlier = Math.max(0, asset.previous_lives - closed);

  const dated: { date: string; entry: TimelineEntry }[] = [
    ...leases.map((contract, index) => ({
      date: contract.startDate,
      entry: { kind: 'lease' as const, number: earlier + index + 1, ...contract },
    })),
    ...refurbishments.map((refurbishment) => ({
      date: refurbishment.date,
      entry: { kind: 'refurbished' as const, ...refurbishment },
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const entries: TimelineEntry[] = [];
  if (earlier > 0) entries.push({ kind: 'earlier', from: 1, to: earlier });
  entries.push(...dated.map((d) => d.entry));

  // What comes next, unless it is out on a lease right now (that lease is the last entry).
  const history = assetHistory(asset, today);
  if (history.stage !== 'leased') {
    entries.push({ kind: 'next', number: history.nextLife, stage: history.stage });
  }
  return entries;
}
