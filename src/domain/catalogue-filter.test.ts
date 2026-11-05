import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import {
  filterCatalogue,
  parseCatalogueParams,
  type CatalogueFilter,
  type CatalogueItem,
} from './catalogue-filter';

function item(
  id: string,
  category: Asset['category'],
  make: string,
  model: string,
  priceCents: number | null,
  status: Asset['status'] = 'available'
): CatalogueItem {
  return {
    priceCents,
    asset: {
      id,
      category,
      make,
      model,
      model_year: 2026,
      serial_number: `SN-${id}`,
      condition: 'new',
      usage: { unit: 'km', value: 0 },
      previous_lives: 0,
      status,
    },
  };
}

const items = [
  item('b1', 'e_bike', 'Kettu Bikes', 'Urban 1', 189_900),
  item('b2', 'e_bike', 'Kettu Bikes', 'Urban 2 Step-through', 219_900, 'reserved'),
  item('b3', 'e_bike', 'Nordvolt', 'Cargo Åland', 349_900, 'returned'),
  item('l1', 'laptop', 'Kettu Works', 'Pro 14', 129_900),
  item('f1', 'farm_machine', 'Pellon', 'Tractor T5', null),
];

const all = (overrides: Partial<CatalogueFilter> = {}): CatalogueFilter => ({
  category: 'e_bike',
  query: '',
  status: null,
  minCents: null,
  maxCents: null,
  ...overrides,
});
const ids = (result: CatalogueItem[]) => result.map((r) => r.asset.id);

describe('filterCatalogue', () => {
  it('keeps only the chosen category', () => {
    expect(ids(filterCatalogue(items, all()))).toEqual(['b1', 'b2', 'b3']);
    expect(ids(filterCatalogue(items, all({ category: 'laptop' })))).toEqual(['l1']);
  });

  it('matches text case-insensitively on make and model', () => {
    expect(ids(filterCatalogue(items, all({ query: 'URBAN' })))).toEqual(['b1', 'b2']);
    expect(ids(filterCatalogue(items, all({ query: 'nordvolt' })))).toEqual(['b3']);
  });

  it('requires every word, in any order', () => {
    expect(ids(filterCatalogue(items, all({ query: 'urban step' })))).toEqual(['b2']);
    expect(ids(filterCatalogue(items, all({ query: 'step kettu' })))).toEqual(['b2']);
    expect(filterCatalogue(items, all({ query: 'urban nordvolt' }))).toEqual([]);
  });

  it('ignores accents and surrounding whitespace', () => {
    expect(ids(filterCatalogue(items, all({ query: '  aland ' })))).toEqual(['b3']);
    expect(ids(filterCatalogue(items, all({ query: 'ÅLAND' })))).toEqual(['b3']);
  });

  it('matches the serial number and model year', () => {
    expect(ids(filterCatalogue(items, all({ query: 'SN-b2' })))).toEqual(['b2']);
    expect(ids(filterCatalogue(items, all({ query: '2026' })))).toEqual(['b1', 'b2', 'b3']);
    expect(filterCatalogue(items, all({ query: '1999' }))).toEqual([]);
  });

  it('treats a blank query as no text filter', () => {
    expect(ids(filterCatalogue(items, all({ query: '   ' })))).toEqual(['b1', 'b2', 'b3']);
  });

  it('applies inclusive price bounds', () => {
    expect(ids(filterCatalogue(items, all({ minCents: 219_900 })))).toEqual(['b2', 'b3']);
    expect(ids(filterCatalogue(items, all({ maxCents: 219_900 })))).toEqual(['b1', 'b2']);
    expect(ids(filterCatalogue(items, all({ minCents: 189_900, maxCents: 189_900 })))).toEqual([
      'b1',
    ]);
  });

  it('returns nothing when min is above max', () => {
    expect(filterCatalogue(items, all({ minCents: 300_000, maxCents: 100_000 }))).toEqual([]);
  });

  it('drops unpriced items only when a price bound is set', () => {
    const farm = all({ category: 'farm_machine' });
    expect(ids(filterCatalogue(items, farm))).toEqual(['f1']);
    expect(filterCatalogue(items, { ...farm, minCents: 0 })).toEqual([]);
    expect(filterCatalogue(items, { ...farm, maxCents: 99_999_999 })).toEqual([]);
  });

  it('combines category, text and price', () => {
    const result = filterCatalogue(items, all({ query: 'kettu', maxCents: 200_000 }));
    expect(ids(result)).toEqual(['b1']);
  });

  it('filters by status, and null means any status', () => {
    expect(ids(filterCatalogue(items, all({ status: 'available' })))).toEqual(['b1']);
    expect(ids(filterCatalogue(items, all({ status: 'reserved' })))).toEqual(['b2']);
    expect(ids(filterCatalogue(items, all({ status: 'returned' })))).toEqual(['b3']);
    expect(filterCatalogue(items, all({ category: 'laptop', status: 'returned' }))).toEqual([]);
  });

  it('combines status with text and price', () => {
    expect(filterCatalogue(items, all({ status: 'reserved', query: 'nordvolt' }))).toEqual([]);
    expect(ids(filterCatalogue(items, all({ status: 'returned', minCents: 300_000 })))).toEqual([
      'b3',
    ]);
  });
});

describe('parseCatalogueParams', () => {
  const categories = ['e_bike', 'laptop', 'farm_machine'] as const;
  const parse = (params: Record<string, string | string[] | undefined>) =>
    parseCatalogueParams(params, categories, 'e_bike');

  it('defaults to the first category with no filters', () => {
    expect(parse({}).filter).toEqual({
      category: 'e_bike',
      query: '',
      status: null,
      minCents: null,
      maxCents: null,
    });
  });

  it('reads a known status and treats an unknown one as any status', () => {
    expect(parse({ status: 'reserved' }).filter.status).toBe('reserved');
    expect(parse({ status: ['returned', 'available'] }).filter.status).toBe('returned');
    expect(parse({ status: 'sold' }).filter.status).toBeNull();
    expect(parse({ status: '' }).filter.status).toBeNull();
  });

  it('reads category, text and euro prices', () => {
    const { filter, minText, maxText } = parse({
      category: 'laptop',
      q: ' pro ',
      min: '1 000,50',
      max: '2000',
    });
    expect(filter).toEqual({
      category: 'laptop',
      query: 'pro',
      status: null,
      minCents: 100_050,
      maxCents: 200_000,
    });
    expect(minText).toBe('1 000,50');
    expect(maxText).toBe('2000');
  });

  it('falls back to the default for an unknown category', () => {
    expect(parse({ category: 'boat' }).filter.category).toBe('e_bike');
    expect(parse({ category: ['laptop', 'e_bike'] }).filter.category).toBe('laptop');
  });

  it('ignores a price that is not an amount, but keeps the text for the form', () => {
    const parsed = parse({ min: 'cheap', max: '-5' });
    expect(parsed.filter.minCents).toBeNull();
    expect(parsed.filter.maxCents).toBeNull();
    expect(parsed.minText).toBe('cheap');
  });

  it('caps the search text length', () => {
    expect(parse({ q: 'a'.repeat(500) }).filter.query).toHaveLength(100);
  });
});
