import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import {
  brandsIn,
  buildCatalogue,
  DEFAULT_SORT,
  isListed,
  isUsed,
  modelVersions,
  unavailableUnits,
  parseCatalogueFilters,
  type CatalogueEntry,
  type CatalogueFilters,
} from './catalogue';

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    category: 'e_bike',
    make: 'Kettu Bikes',
    model: 'Urban 1',
    model_year: 2026,
    serial_number: `SN-${id}`,
    condition: 'new',
    usage: { unit: 'km', value: 0 },
    previous_lives: 0,
    status: 'available',
    ...over,
  };
}

const entry = (a: Asset, monthlyCents: number | null): CatalogueEntry => ({
  asset: a,
  monthlyCents,
});

const ALL: CatalogueFilters = { category: null, condition: null, make: null, sort: 'price_asc' };

// The pack's shapes: two identical new Trail 500s, an Urban 1 new and on its third life,
// a laptop, a reserved bike and a leased one.
const entries: CatalogueEntry[] = [
  entry(asset('ebike-001'), 6_822),
  entry(asset('ebike-003', { make: 'Nordvolt', model: 'Trail 500' }), 13_466),
  entry(
    asset('ebike-008', {
      condition: 'good',
      usage: { unit: 'km', value: 9_800 },
      model_year: 2022,
      previous_lives: 2,
    }),
    6_463
  ),
  entry(asset('ebike-009', { make: 'Lumo', model: 'Gravel X', status: 'reserved' }), 15_890),
  entry(asset('ebike-012', { make: 'Nordvolt', model: 'Trail 500' }), 13_466),
  entry(
    asset('laptop-001', {
      category: 'laptop',
      make: 'Pohja Compute',
      model: 'Air 13',
      usage: { unit: 'battery_cycles', value: 0 },
    }),
    4_307
  ),
  entry(asset('ebike-013', { make: 'Lumo', model: 'Kids 20' }), null),
  entry(asset('ebike-014', { make: 'Lumo', model: 'Gravel X', status: 'leased' }), 15_890),
  entry(
    asset('ebike-015', {
      make: 'Nordvolt',
      model: 'Cargo Duo',
      status: 'returned',
      condition: 'fair',
      previous_lives: 1,
    }),
    19_006
  ),
  entry(asset('ebike-016', { make: 'Nordvolt', model: 'Trail 500', status: 'sold' }), 13_466),
];

describe('isListed and isUsed', () => {
  it('lists only what can be leased today: available, not leased, reserved, returned or sold', () => {
    expect(isListed(asset('a'))).toBe(true);
    for (const status of ['leased', 'reserved', 'returned', 'sold'] as const) {
      expect(isListed(asset('a', { status }))).toBe(false);
    }
  });

  it('calls an item used from its second life on, whatever its condition', () => {
    expect(isUsed(asset('a'))).toBe(false);
    expect(isUsed(asset('a', { previous_lives: 1, condition: 'like_new' }))).toBe(true);
  });
});

describe('buildCatalogue', () => {
  it('stacks the units of one model into one group, lowest price first by default', () => {
    const groups = buildCatalogue(entries, ALL);
    expect(groups.map((g) => g.model)).toEqual(['Air 13', 'Urban 1', 'Trail 500', 'Kids 20']);
  });

  it('leaves out the reserved and the leased bikes (trap: reserved items)', () => {
    const ids = buildCatalogue(entries, ALL).flatMap((g) => g.versions.flatMap((v) => v.assetIds));
    expect(ids).not.toContain('ebike-009');
    expect(ids).not.toContain('ebike-014');
  });

  it('gives a model with a new and a used unit two versions, new first, and its price range', () => {
    const urban = buildCatalogue(entries, ALL).find((g) => g.model === 'Urban 1')!;
    expect(urban.versions.map((v) => v.asset.id)).toEqual(['ebike-001', 'ebike-008']);
    expect(urban).toMatchObject({
      count: 2,
      hasNew: true,
      hasUsed: true,
      minMonthlyCents: 6_463,
      maxMonthlyCents: 6_822,
    });
  });

  it('folds identical units into one version that counts them', () => {
    const trail = buildCatalogue(entries, ALL).find((g) => g.model === 'Trail 500')!;
    expect(trail.versions).toHaveLength(1);
    expect(trail.versions[0]!.assetIds).toEqual(['ebike-003', 'ebike-012']);
    expect(trail.count).toBe(2);
    expect(trail.minMonthlyCents).toBe(trail.maxMonthlyCents);
  });

  it('gives a model with no plain monthly price no range (its card says to see the details)', () => {
    const kids = buildCatalogue(entries, ALL).find((g) => g.model === 'Kids 20')!;
    expect(kids.minMonthlyCents).toBeNull();
    expect(kids.maxMonthlyCents).toBeNull();
  });

  it('filters by category', () => {
    const groups = buildCatalogue(entries, { ...ALL, category: 'laptop' });
    expect(groups.map((g) => g.model)).toEqual(['Air 13']);
  });

  it('filters by new or used within the group, so the range is of the matching units only', () => {
    const used = buildCatalogue(entries, { ...ALL, condition: 'used' });
    expect(used.map((g) => g.model)).toEqual(['Urban 1']);
    expect(used[0]).toMatchObject({ count: 1, hasNew: false, minMonthlyCents: 6_463 });
    const fresh = buildCatalogue(entries, { ...ALL, condition: 'new' });
    expect(fresh.find((g) => g.model === 'Urban 1')).toMatchObject({ count: 1, hasUsed: false });
  });

  it('filters by brand only inside a category', () => {
    const inBikes = buildCatalogue(entries, { ...ALL, category: 'e_bike', make: 'Nordvolt' });
    expect(inBikes.map((g) => g.model)).toEqual(['Trail 500']);
    const everywhere = buildCatalogue(entries, { ...ALL, make: 'Nordvolt' });
    expect(everywhere).toHaveLength(4);
  });

  it('sorts by the lowest monthly price either way, models without one last', () => {
    const up = buildCatalogue(entries, { ...ALL, sort: 'price_asc' }).map((g) => g.model);
    expect(up).toEqual(['Air 13', 'Urban 1', 'Trail 500', 'Kids 20']);
    const down = buildCatalogue(entries, { ...ALL, sort: 'price_desc' }).map((g) => g.model);
    expect(down).toEqual(['Trail 500', 'Urban 1', 'Air 13', 'Kids 20']);
  });

  it('sorts lowest price first when the URL names no sort', () => {
    expect(parseCatalogueFilters({}).sort).toBe(DEFAULT_SORT);
    expect(DEFAULT_SORT).toBe('price_asc');
    expect(parseCatalogueFilters({ sort: 'default' }).sort).toBe('price_asc');
  });

  it('gives an empty list for no entries', () => {
    expect(buildCatalogue([], ALL)).toEqual([]);
  });
});

describe('unavailableUnits', () => {
  it('lists the returned units first, then the leased ones, never reserved or sold (D42)', () => {
    const ids = unavailableUnits(entries, ALL).map((a) => a.id);
    expect(ids).toEqual(['ebike-015', 'ebike-014']);
  });

  it('shows the same units under the Unavailable filter, and the stacks are then empty', () => {
    const filters: CatalogueFilters = { ...ALL, condition: 'unavailable' };
    expect(unavailableUnits(entries, filters).map((a) => a.id)).toEqual(['ebike-015', 'ebike-014']);
    expect(buildCatalogue(entries, filters)).toEqual([]);
  });

  it('shows none under New or Used, which are about what can be leased', () => {
    expect(unavailableUnits(entries, { ...ALL, condition: 'new' })).toEqual([]);
    expect(unavailableUnits(entries, { ...ALL, condition: 'used' })).toEqual([]);
  });

  it('follows the category and the brand', () => {
    expect(unavailableUnits(entries, { ...ALL, category: 'laptop' })).toEqual([]);
    const lumo = unavailableUnits(entries, { ...ALL, category: 'e_bike', make: 'Lumo' });
    expect(lumo.map((a) => a.id)).toEqual(['ebike-014']);
  });
});

describe('modelVersions', () => {
  it('gives the versions of the unit model, new first, for the version picker', () => {
    const versions = modelVersions(entries, 'ebike-008');
    expect(versions.map((v) => v.asset.id)).toEqual(['ebike-001', 'ebike-008']);
  });

  it('keeps the unit itself when it is not listed, with its own status, and no unlisted others', () => {
    const versions = modelVersions(entries, 'ebike-009');
    expect(versions).toHaveLength(1);
    expect(versions[0]!.asset).toMatchObject({ id: 'ebike-009', status: 'reserved' });
  });

  it('is empty for an unknown id', () => {
    expect(modelVersions(entries, 'nope')).toEqual([]);
  });
});

describe('brandsIn', () => {
  it('lists the brands of a category that has something to lease, alphabetically', () => {
    expect(brandsIn(entries, 'e_bike')).toEqual(['Kettu Bikes', 'Lumo', 'Nordvolt']);
    expect(brandsIn(entries, 'farm_machine')).toEqual([]);
  });
});

describe('parseCatalogueFilters', () => {
  it('reads the four filters from the URL', () => {
    expect(
      parseCatalogueFilters({
        category: 'e_bike',
        condition: 'used',
        brand: 'Nordvolt',
        sort: 'price_asc',
      })
    ).toEqual({ category: 'e_bike', condition: 'used', make: 'Nordvolt', sort: 'price_asc' });
    expect(parseCatalogueFilters({ condition: 'unavailable' }).condition).toBe('unavailable');
  });

  it('ignores unknown or repeated values and a brand without a category', () => {
    expect(
      parseCatalogueFilters({ category: 'boat', condition: ['new', 'used'], brand: 'X', sort: 'z' })
    ).toEqual(ALL);
    expect(parseCatalogueFilters({})).toEqual(ALL);
  });
});
