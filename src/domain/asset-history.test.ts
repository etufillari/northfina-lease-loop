import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import { assetHistory } from './asset-history';

const asset = (overrides: Partial<Asset>): Asset => ({
  id: 'ebike-008',
  category: 'e_bike',
  make: 'Kettu Bikes',
  model: 'Urban 1',
  model_year: 2022,
  serial_number: 'SN-1',
  condition: 'good',
  usage: { unit: 'km', value: 12_000 },
  previous_lives: 2,
  status: 'returned',
  ...overrides,
});

describe('assetHistory', () => {
  it('puts an item with 2 lives behind it on course for its 3rd (scenario card 10)', () => {
    expect(assetHistory(asset({}), '2026-11-05')).toEqual({
      previousLives: 2,
      nextLife: 3,
      ageYears: 4,
      stage: 'awaiting_refurbishment',
    });
  });

  it('gives a brand-new item its first life, aged 0', () => {
    expect(
      assetHistory(
        asset({ previous_lives: 0, model_year: 2026, status: 'available' }),
        '2026-11-05'
      )
    ).toMatchObject({ nextLife: 1, ageYears: 0, stage: 'available' });
  });

  it('never reports a negative age for next year’s model', () => {
    expect(assetHistory(asset({ model_year: 2027 }), '2026-11-05').ageYears).toBe(0);
  });

  it('maps reserved to reserved', () => {
    expect(assetHistory(asset({ status: 'reserved' }), '2026-11-05').stage).toBe('reserved');
  });

  it('throws on a date that is not YYYY-MM-DD', () => {
    expect(() => assetHistory(asset({}), 'yesterday')).toThrow(RangeError);
  });
});
