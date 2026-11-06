import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import { CATALOGUE_QUERY_LIMIT, filterCatalogue, readCatalogueFilters } from './catalogue-filter';

const firstBike: Asset = {
  id: 'ebike-001',
  category: 'e_bike',
  make: 'Nordvolt',
  model: 'Trail 500',
  model_year: 2025,
  serial_number: 'BIKE-FIRST',
  condition: 'new',
  usage: { unit: 'km', value: 0 },
  previous_lives: 0,
  status: 'available',
};
const assets: readonly Asset[] = [
  firstBike,
  {
    ...firstBike,
    id: 'ebike-008',
    serial_number: 'BIKE-LATER',
    condition: 'like_new',
    usage: { unit: 'km', value: 18000 },
    previous_lives: 2,
    status: 'returned',
  },
  {
    ...firstBike,
    id: 'laptop-001',
    category: 'laptop',
    make: 'Nordbyte',
    model: 'Notebook Pro',
    serial_number: 'LAPTOP-FIRST',
    usage: { unit: 'battery_cycles', value: 0 },
    status: 'reserved',
  },
  {
    ...firstBike,
    id: 'farm-001',
    category: 'farm_machine',
    make: 'Nordfarms',
    model: 'Lift 12',
    serial_number: 'FARM-LATER',
    condition: 'good',
    usage: { unit: 'engine_hours', value: 1200 },
    previous_lives: 1,
  },
];

describe('readCatalogueFilters', () => {
  it('defaults to the full catalogue and ignores unknown parameters', () => {
    expect(readCatalogueFilters({ other: 'value' })).toEqual({
      query: '',
      category: 'all',
      life: 'all',
    });
  });

  it.each([
    ['e_bike', 'first'],
    ['laptop', 'later'],
    ['farm_machine', 'all'],
  ])('keeps valid category %s and lease history %s', (category, life) => {
    expect(readCatalogueFilters({ q: '  NoRdVoLt  ', category, life })).toEqual({
      query: 'NoRdVoLt',
      category,
      life,
    });
  });

  it('bounds the display query without lowercasing it', () => {
    const query = 'A'.repeat(CATALOGUE_QUERY_LIMIT + 1);
    expect(readCatalogueFilters({ q: query }).query).toBe('A'.repeat(CATALOGUE_QUERY_LIMIT));
  });

  it.each([
    { q: '   ', category: 'unknown', life: 'new' },
    { q: ['bike', 'laptop'], category: ['e_bike', 'laptop'], life: ['first', 'later'] },
  ])('ignores invalid or ambiguous URL parameters: %o', (params) => {
    expect(readCatalogueFilters(params)).toEqual({ query: '', category: 'all', life: 'all' });
  });
});

describe('filterCatalogue', () => {
  it.each([
    ['nOrDvOlT', ['ebike-001', 'ebike-008']],
    ['tRAiL 500', ['ebike-001', 'ebike-008']],
    ['NORDVOLT TRAIL 500', ['ebike-001', 'ebike-008']],
    ['LAPTOP-001', ['laptop-001']],
  ])('matches make, model or item ID without case sensitivity: %s', (query, ids) => {
    expect(
      filterCatalogue(assets, readCatalogueFilters({ q: query })).map((asset) => asset.id)
    ).toEqual(ids);
  });

  it('combines query, category and completed-lease filters', () => {
    const filters = readCatalogueFilters({ q: 'NORD', category: 'e_bike', life: 'later' });
    expect(filterCatalogue(assets, filters).map((asset) => asset.id)).toEqual(['ebike-008']);
    expect(filterCatalogue(assets, { ...filters, life: 'first' }).map((asset) => asset.id)).toEqual(
      ['ebike-001']
    );
  });

  it('keeps input order and all availability states without filters, without changing the input', () => {
    const before = structuredClone(assets);
    expect(filterCatalogue(assets, readCatalogueFilters({}))).toEqual(assets);
    filterCatalogue(assets, readCatalogueFilters({ life: 'later' }));
    expect(assets).toEqual(before);
  });

  it('returns no matches for a missing item, incompatible filters or an empty catalogue', () => {
    expect(filterCatalogue(assets, readCatalogueFilters({ q: 'not-in-catalogue' }))).toEqual([]);
    expect(
      filterCatalogue(assets, readCatalogueFilters({ category: 'laptop', life: 'later' }))
    ).toEqual([]);
    expect(filterCatalogue([], readCatalogueFilters({}))).toEqual([]);
  });
});
