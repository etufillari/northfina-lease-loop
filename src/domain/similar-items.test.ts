import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import { similarAvailable } from './similar-items';

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    category: 'e_bike',
    make: 'Make',
    model: 'Model',
    model_year: 2024,
    serial_number: `SN-${id}`,
    condition: 'good',
    usage: { unit: 'km', value: 0 },
    previous_lives: 0,
    status: 'available',
    ...over,
  };
}

describe('similarAvailable: items to suggest when this one cannot be leased', () => {
  const current = asset('ebike-009', { status: 'reserved', model_year: 2024 });

  it('keeps only available items of the same category, never the item itself', () => {
    const all = [
      current,
      asset('ebike-001'),
      asset('ebike-007', { status: 'returned' }),
      asset('ebike-008', { status: 'reserved' }),
      asset('laptop-001', { category: 'laptop' }),
    ];
    expect(similarAvailable(all, current).map((a) => a.id)).toEqual(['ebike-001']);
  });

  it('puts the closest model year first, ties by id, and stops at three', () => {
    const all = [
      asset('ebike-005', { model_year: 2021 }), // 3 years off: the fourth, dropped
      asset('ebike-004', { model_year: 2025 }), // 1 year off
      asset('ebike-003', { model_year: 2024 }), // same year: first
      asset('ebike-002', { model_year: 2023 }), // 1 year off, lower id than ebike-004
      current,
    ];
    expect(similarAvailable(all, current).map((a) => a.id)).toEqual([
      'ebike-003',
      'ebike-002',
      'ebike-004',
    ]);
  });

  it('takes a smaller limit', () => {
    const all = [asset('ebike-001'), asset('ebike-002'), current];
    expect(similarAvailable(all, current, 1).map((a) => a.id)).toEqual(['ebike-001']);
  });

  it('is empty when nothing similar is available', () => {
    expect(similarAvailable([], current)).toEqual([]);
    expect(similarAvailable([current], current)).toEqual([]);
    expect(similarAvailable([asset('ebike-001')], current, 0)).toEqual([]);
  });
});
