// Which items to suggest when the one you are looking at can't be leased today: available items of
// the same category, closest model year first, so a reserved e-bike points at other e-bikes.
import type { Asset } from '@/data/schemas';

/**
 * Up to `limit` available items like `current`: same category, nearest model year, then by id.
 * `isLeasable` drops items that are available but can't be leased today (no price, or under the
 * minimum), so a suggestion never opens on a refusal. It runs before the limit, so the list still
 * fills up from the next closest items.
 */
export function similarAvailable(
  assets: readonly Asset[],
  current: Asset,
  limit = 3,
  isLeasable: (asset: Asset) => boolean = () => true
): Asset[] {
  return assets
    .filter(
      (a) =>
        a.id !== current.id &&
        a.category === current.category &&
        a.status === 'available' &&
        isLeasable(a)
    )
    .sort(
      (a, b) =>
        Math.abs(a.model_year - current.model_year) - Math.abs(b.model_year - current.model_year) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, Math.max(0, limit));
}
