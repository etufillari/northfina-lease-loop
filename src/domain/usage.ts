// An item's usage, kept as two counters (docs/DECISIONS.md "Usage"):
// - total: lifetime km / battery cycles / engine hours. Never resets; the passport shows it.
// - since the last reset (`usage.value`): a new battery resets it for e-bikes and laptops,
//   a major service for farm machines. The refurbishment thresholds read it.
// Market value reads the counter the wear really follows: a category whose battery work
// resets usage (`resets_usage` in data/refurbishment-costs.json: e-bikes, laptops) is valued
// on usage since the last battery; otherwise (farm machines: an engine does not get younger
// with a service) on the lifetime total.
import type { Asset, AssetCategory, RefurbishmentCosts } from '@/data/schemas';

/** `per started 1000 engine_hours since last service` → 1000; anything else → null. */
export function serviceInterval(when: string): number | null {
  const match = /^per started (\d+) \S+ since last service$/.exec(when.trim());
  return match ? Number(match[1]) : null;
}

/** The category's service interval, when its refurbishment data has one. */
export function categoryServiceInterval(
  category: AssetCategory,
  costs: RefurbishmentCosts
): number | null {
  for (const item of costs[category].fixed) {
    const interval = serviceInterval(item.when);
    if (interval !== null) return interval;
  }
  return null;
}

/** True when market value follows the lifetime total rather than usage since the reset. */
export function valueFollowsTotal(category: AssetCategory, costs: RefurbishmentCosts): boolean {
  return !costs[category].fixed.some((item) => item.resets_usage === true);
}

/** The usage figure market value is computed from. */
export function valueUsage(
  asset: Pick<Asset, 'category' | 'usage'>,
  costs: RefurbishmentCosts,
  sinceReset: number = asset.usage.value
): number {
  return valueFollowsTotal(asset.category, costs)
    ? (asset.usage.total ?? asset.usage.value)
    : sinceReset;
}

/**
 * The two counters for a data-pack item, which gives one number. That number is the lifetime
 * total. Since the reset: the same number (no battery history is known), except where the
 * category has a service interval — those machines are assumed to have been serviced on
 * schedule, so only the hours since the last whole interval count (farm-005: 4,200 h → 200).
 */
export function initialUsage(
  asset: Pick<Asset, 'category' | 'usage'>,
  costs: RefurbishmentCosts
): { total: number; sinceReset: number } {
  const total = asset.usage.value;
  const interval = categoryServiceInterval(asset.category, costs);
  return { total, sinceReset: interval === null ? total : total % interval };
}

export type ReadingResult =
  | { ok: true; total: number; sinceReset: number; added: number }
  | { ok: false; reason: 'reading_below_total' | 'reading_not_whole' };

/**
 * A meter reading taken at a return (the lifetime figure on the odometer / battery report /
 * hour meter). It can never be below the lifetime total; the difference is what this lease
 * used, and it is added to both counters.
 */
export function recordReading(
  usage: { total: number; sinceReset: number },
  reading: number
): ReadingResult {
  if (!Number.isInteger(reading) || reading < 0) return { ok: false, reason: 'reading_not_whole' };
  if (reading < usage.total) return { ok: false, reason: 'reading_below_total' };
  const added = reading - usage.total;
  return { ok: true, total: reading, sinceReset: usage.sinceReset + added, added };
}
