import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import { filterAssets } from './asset-filter';

const assets: Asset[] = [
  {
    id: 'bike-1',
    category: 'e_bike',
    make: 'Example',
    model: 'Bike One',
    model_year: 2025,
    serial_number: 'bike-serial-1',
    condition: 'good',
    usage: { unit: 'km', value: 100 },
    previous_lives: 1,
    status: 'available',
  },
  {
    id: 'laptop-1',
    category: 'laptop',
    make: 'Example',
    model: 'Laptop One',
    model_year: 2024,
    serial_number: 'laptop-serial-1',
    condition: 'good',
    usage: { unit: 'battery_cycles', value: 50 },
    previous_lives: 2,
    status: 'reserved',
  },
  {
    id: 'farm-1',
    category: 'farm_machine',
    make: 'Example',
    model: 'Machine One',
    model_year: 2023,
    serial_number: 'farm-serial-1',
    condition: 'fair',
    usage: { unit: 'engine_hours', value: 500 },
    previous_lives: 0,
    status: 'available',
  },
];

describe('filterAssets', () => {
  it('returns every asset when no filters are selected', () => {
    expect(filterAssets(assets)).toEqual(assets);
  });

  it('filters by category, status, or condition independently', () => {
    expect(filterAssets(assets, { category: 'laptop' }).map((asset) => asset.id)).toEqual([
      'laptop-1',
    ]);
    expect(filterAssets(assets, { status: 'reserved' }).map((asset) => asset.id)).toEqual([
      'laptop-1',
    ]);
    expect(filterAssets(assets, { condition: 'fair' }).map((asset) => asset.id)).toEqual([
      'farm-1',
    ]);
  });

  it('combines selected filters with AND', () => {
    expect(
      filterAssets(assets, { status: 'available', condition: 'good' }).map((asset) => asset.id)
    ).toEqual(['bike-1']);
    expect(
      filterAssets(assets, { category: 'e_bike', status: 'reserved', condition: 'good' })
    ).toEqual([]);
  });

  it('returns an empty list when there are no assets', () => {
    expect(filterAssets([], { category: 'laptop' })).toEqual([]);
  });
});
