import { beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadPriceLists } from '@/data/load';
import type { Asset, PriceList } from '@/data/schemas';
import {
  catalogueStatuses,
  browseCatalogue,
  catalogueSearchString,
  defaultCatalogueQuery,
  matchesSearch,
  MAX_SEARCH_LENGTH,
  parseCatalogueQuery,
  type CatalogueQuery,
} from './catalogue';

function asset(overrides: Partial<Asset> & Pick<Asset, 'id'>): Asset {
  return {
    category: 'e_bike',
    make: 'Make',
    model: 'Model',
    model_year: 2025,
    serial_number: `SN-${overrides.id}`,
    condition: 'new',
    usage: { unit: 'km', value: 0 },
    previous_lives: 0,
    status: 'available',
    ...overrides,
  };
}

const bike = asset({ id: 'bike-a', make: 'Kettu', model: 'Urban 1', model_year: 2024 });
const bike2 = asset({ id: 'bike-b', make: 'Nordvolt', model: 'Trail 500', status: 'reserved' });
const laptop = asset({
  id: 'laptop-a',
  category: 'laptop',
  make: 'Äänekoski',
  model: 'Book',
  model_year: 2026,
});
const tractor = asset({ id: 'farm-a', category: 'farm_machine', make: 'Agro', model: 'T7' });
const unpriced = asset({ id: 'bike-z', make: 'Zeta', model: 'Ghost' });

const priceLists: PriceList[] = [
  {
    version: 1,
    valid_from: '2026-01-01',
    valid_to: null,
    note: '',
    prices: { 'bike-a': 200_000, 'bike-b': 100_000, 'laptop-a': 150_000, 'farm-a': 900_000 },
  },
];

const all = [tractor, laptop, unpriced, bike2, bike];
const ids = (query: Partial<CatalogueQuery>) =>
  browseCatalogue(all, priceLists, '2026-11-05', { ...defaultCatalogueQuery, ...query }).map(
    (item) => item.asset.id
  );

describe('parseCatalogueQuery', () => {
  it('returns the defaults for an empty URL', () => {
    expect(parseCatalogueQuery({})).toEqual(defaultCatalogueQuery);
  });

  it('reads every filter', () => {
    expect(
      parseCatalogueQuery({
        q: '  trail ',
        category: 'e_bike',
        status: 'available',
        sort: 'newest',
      })
    ).toEqual({ search: 'trail', category: 'e_bike', status: 'available', sort: 'newest' });
  });

  it('ignores unknown values instead of failing', () => {
    expect(parseCatalogueQuery({ category: 'boat', status: 'stolen', sort: 'random' })).toEqual(
      defaultCatalogueQuery
    );
  });

  it('uses the first value when a key is repeated', () => {
    expect(parseCatalogueQuery({ category: ['laptop', 'e_bike'] }).category).toBe('laptop');
  });

  it('cuts very long searches', () => {
    expect(parseCatalogueQuery({ q: 'x'.repeat(500) }).search).toHaveLength(MAX_SEARCH_LENGTH);
  });
});

describe('catalogueSearchString', () => {
  it('is empty for the defaults', () => {
    expect(catalogueSearchString(defaultCatalogueQuery)).toBe('');
  });

  it('leaves out defaults and round-trips through parseCatalogueQuery', () => {
    const query: CatalogueQuery = {
      search: 'trail 500',
      category: 'e_bike',
      status: null,
      sort: 'price_desc',
    };
    const text = catalogueSearchString(query);
    expect(text).toBe('?q=trail+500&category=e_bike&sort=price_desc');
    expect(parseCatalogueQuery(Object.fromEntries(new URLSearchParams(text)))).toEqual(query);
  });
});

describe('matchesSearch', () => {
  it('matches everything when the search is blank', () => {
    expect(matchesSearch(bike, '   ')).toBe(true);
  });

  it('needs every word, in any order, ignoring case', () => {
    expect(matchesSearch(bike2, '500 NORDVOLT')).toBe(true);
    expect(matchesSearch(bike2, 'nordvolt urban')).toBe(false);
  });

  it('ignores accents both ways', () => {
    expect(matchesSearch(laptop, 'aanekoski')).toBe(true);
    expect(matchesSearch(asset({ id: 'x', make: 'Aanekoski' }), 'ääne')).toBe(true);
  });

  it('finds an asset by id, serial number or model year', () => {
    expect(matchesSearch(bike, 'bike-a')).toBe(true);
    expect(matchesSearch(bike, 'sn-bike-a')).toBe(true);
    expect(matchesSearch(bike, '2024')).toBe(true);
  });
});

describe('browseCatalogue', () => {
  it('groups by category by default, then by id', () => {
    expect(ids({})).toEqual(['bike-a', 'bike-b', 'bike-z', 'laptop-a', 'farm-a']);
  });

  it('filters by category', () => {
    expect(ids({ category: 'e_bike' })).toEqual(['bike-a', 'bike-b', 'bike-z']);
  });

  it('filters by status', () => {
    expect(ids({ status: 'reserved' })).toEqual(['bike-b']);
  });

  it('never shows sold items, and has no "sold" filter', () => {
    const sold = asset({ id: 'bike-s', make: 'Kettu', model: 'Urban 1', status: 'sold' });
    const browse = (query: Partial<CatalogueQuery>) =>
      browseCatalogue([...all, sold], priceLists, '2026-11-05', {
        ...defaultCatalogueQuery,
        ...query,
      }).map((item) => item.asset.id);
    expect(browse({})).not.toContain('bike-s');
    expect(browse({ category: 'e_bike', search: 'kettu' })).toEqual(['bike-a']);
    expect(catalogueStatuses).not.toContain('sold');
    expect(parseCatalogueQuery({ status: 'sold' }).status).toBeNull();
    // Reserved items still show by default.
    expect(browse({})).toContain('bike-b');
  });

  it('combines filters and search', () => {
    expect(ids({ category: 'e_bike', status: 'available', search: 'kettu' })).toEqual(['bike-a']);
    expect(ids({ category: 'laptop', search: 'kettu' })).toEqual([]);
  });

  it('sorts by price, cheapest first, with unpriced items last', () => {
    expect(ids({ sort: 'price_asc' })).toEqual([
      'bike-b',
      'laptop-a',
      'bike-a',
      'farm-a',
      'bike-z',
    ]);
  });

  it('sorts by price, most expensive first, with unpriced items still last', () => {
    expect(ids({ sort: 'price_desc' })).toEqual([
      'farm-a',
      'bike-a',
      'laptop-a',
      'bike-b',
      'bike-z',
    ]);
  });

  it('sorts by newest model year, ties by id', () => {
    expect(ids({ sort: 'newest' })).toEqual(['laptop-a', 'bike-b', 'bike-z', 'farm-a', 'bike-a']);
  });

  it('sorts by make and model, treating Ä like A', () => {
    // "Äänekoski" → "aa…" sorts before "Agro" → "ag…".
    expect(ids({ sort: 'name' })).toEqual(['laptop-a', 'farm-a', 'bike-a', 'bike-b', 'bike-z']);
  });

  it('attaches the price on the date, or why there is none', () => {
    const items = browseCatalogue(all, priceLists, '2026-11-05', defaultCatalogueQuery);
    expect(items.find((i) => i.asset.id === 'bike-a')?.price).toEqual({
      ok: true,
      priceCents: 200_000,
      priceListVersion: 1,
    });
    expect(items.find((i) => i.asset.id === 'bike-z')?.price).toEqual({
      ok: false,
      reason: 'unknown_asset',
    });
  });

  it('returns an empty list for no assets', () => {
    expect(browseCatalogue([], priceLists, '2026-11-05', defaultCatalogueQuery)).toEqual([]);
  });
});

describe('browseCatalogue with the data pack', () => {
  let assets: Asset[];
  let lists: PriceList[];
  beforeAll(async () => {
    [assets, lists] = await Promise.all([loadAssets(), loadPriceLists()]);
  });

  it('shows the 12 e-bikes with the new price list from Friday 6 Nov 2026', () => {
    const items = browseCatalogue(assets, lists, '2026-11-06', {
      ...defaultCatalogueQuery,
      category: 'e_bike',
      sort: 'price_asc',
    });
    expect(items).toHaveLength(12);
    expect(items.every((i) => i.price.ok && i.price.priceListVersion === 2)).toBe(true);
    expect(items[0]?.asset.id).toBe('ebike-010'); // the item that is too cheap to lease
  });

  it('prices ebike-003 from list 1 on Thursday 5 Nov 2026', () => {
    const items = browseCatalogue(assets, lists, '2026-11-05', {
      ...defaultCatalogueQuery,
      search: 'ebike-003',
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.price).toEqual({ ok: true, priceCents: 389_000, priceListVersion: 1 });
  });
});
