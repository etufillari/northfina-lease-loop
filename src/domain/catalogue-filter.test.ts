import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import {
  BROWSE_CATEGORIES,
  catalogueQuery,
  countByCategory,
  filterCatalogue,
  parseCatalogueFilter,
} from './catalogue-filter';

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    category: 'e_bike',
    make: 'Make',
    model: 'Model',
    model_year: 2024,
    serial_number: `SN-${id}`,
    condition: 'new',
    usage: { unit: 'km', value: 0 },
    previous_lives: 0,
    status: 'available',
    ...over,
  };
}

const bikeNew = asset('b1');
const bikeUsed = asset('b2', { previous_lives: 1, status: 'reserved' });
const laptopUsed = asset('l1', { category: 'laptop', previous_lives: 2 });
const all = [bikeNew, bikeUsed, laptopUsed];

describe('parseCatalogueFilter', () => {
  it('reads a known category, condition and the available flag', () => {
    expect(
      parseCatalogueFilter({ category: 'car', condition: 'second_life', available: '1' })
    ).toEqual({ category: 'car', condition: 'second_life', availableOnly: true });
  });

  it('ignores unknown or missing values instead of failing', () => {
    expect(parseCatalogueFilter({ category: 'boat', condition: 'mint', available: 'yes' })).toEqual(
      { category: null, condition: null, availableOnly: false }
    );
    expect(parseCatalogueFilter({})).toEqual({
      category: null,
      condition: null,
      availableOnly: false,
    });
  });

  it('takes the first value when a parameter repeats', () => {
    expect(parseCatalogueFilter({ category: ['laptop', 'car'] }).category).toBe('laptop');
  });
});

describe('filterCatalogue', () => {
  const none = { category: null, condition: null, availableOnly: false } as const;

  it('keeps everything with no filter', () => {
    expect(filterCatalogue(all, none)).toEqual(all);
  });

  it('keeps one category', () => {
    expect(filterCatalogue(all, { ...none, category: 'laptop' })).toEqual([laptopUsed]);
  });

  it('a category with no items gives an empty list', () => {
    expect(filterCatalogue(all, { ...none, category: 'car' })).toEqual([]);
  });

  it('new means no previous lives, second life means one or more', () => {
    expect(filterCatalogue(all, { ...none, condition: 'new' })).toEqual([bikeNew]);
    expect(filterCatalogue(all, { ...none, condition: 'second_life' })).toEqual([
      bikeUsed,
      laptopUsed,
    ]);
  });

  it('available only drops reserved, returned and sold items', () => {
    expect(filterCatalogue(all, { ...none, availableOnly: true })).toEqual([bikeNew, laptopUsed]);
  });

  it('combines filters', () => {
    expect(
      filterCatalogue(all, { category: 'e_bike', condition: 'second_life', availableOnly: true })
    ).toEqual([]);
  });
});

describe('countByCategory', () => {
  it('counts every browse category, zero where there are no items', () => {
    const counts = countByCategory(all);
    expect(counts.e_bike).toBe(2);
    expect(counts.laptop).toBe(1);
    expect(counts.farm_machine).toBe(0);
    expect(counts.car).toBe(0);
    expect(Object.keys(counts)).toEqual([...BROWSE_CATEGORIES]);
  });

  it('counts nothing in an empty catalogue', () => {
    expect(Object.values(countByCategory([])).every((n) => n === 0)).toBe(true);
  });
});

describe('catalogueQuery', () => {
  it('is empty with no filter', () => {
    expect(catalogueQuery({ category: null, condition: null, availableOnly: false })).toBe('');
  });

  it('writes every set value, and reads back to the same filter', () => {
    const filter = { category: 'e_bike', condition: 'new', availableOnly: true } as const;
    const query = catalogueQuery(filter);
    expect(query).toBe('?category=e_bike&condition=new&available=1');
    expect(parseCatalogueFilter(Object.fromEntries(new URLSearchParams(query)))).toEqual(filter);
  });
});
