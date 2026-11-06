import { describe, expect, it } from 'vitest';
import type { Asset } from '@/data/schemas';
import { assetTimeline, type TimelineContract } from './asset-timeline';

const asset = (overrides: Partial<Asset>): Asset => ({
  id: 'ebike-008',
  category: 'e_bike',
  make: 'Kettu Bikes',
  model: 'Urban 1',
  model_year: 2022,
  serial_number: 'SN-1',
  condition: 'good',
  usage: { unit: 'km', value: 9_800 },
  previous_lives: 2,
  status: 'returned',
  ...overrides,
});

const lease = (overrides: Partial<TimelineContract>): TimelineContract => ({
  startDate: '2026-11-05',
  endDate: '2027-11-04',
  status: 'returned',
  customerName: 'Aino Virtanen',
  closedDate: '2027-11-05',
  ...overrides,
});

describe('assetTimeline', () => {
  it('counts the data pack’s lives when we have no records (ebike-008, 2 lives)', () => {
    expect(assetTimeline(asset({}), [], [], '2026-11-05')).toEqual([
      { kind: 'earlier', from: 1, to: 2 },
      { kind: 'next', number: 3, stage: 'awaiting_refurbishment' },
    ]);
  });

  it('tells our own leases in full after the counted ones', () => {
    // ebike-008 had 2 lives in the data pack; Aino's lease made it 3
    const entries = assetTimeline(
      asset({ previous_lives: 3 }),
      [lease({})],
      [{ date: '2027-11-10', conditionBefore: 'fair', conditionAfter: 'good', priceCents: 99_000 }],
      '2027-11-20'
    );
    expect(entries.map((e) => e.kind)).toEqual(['earlier', 'lease', 'refurbished', 'next']);
    expect(entries[0]).toEqual({ kind: 'earlier', from: 1, to: 2 });
    expect(entries[1]).toMatchObject({ kind: 'lease', number: 3, customerName: 'Aino Virtanen' });
    expect(entries[3]).toMatchObject({ kind: 'next', number: 4 });
  });

  it('ends with the running lease when the item is out on one', () => {
    const entries = assetTimeline(
      asset({ previous_lives: 0, status: 'leased' }),
      [lease({ status: 'active', closedDate: null })],
      [],
      '2027-01-01'
    );
    expect(entries).toEqual([
      expect.objectContaining({ kind: 'lease', number: 1, status: 'active' }),
    ]);
  });

  it('numbers several leases of a new item from 1, oldest first', () => {
    const entries = assetTimeline(
      asset({ previous_lives: 2, status: 'available' }),
      [lease({ startDate: '2028-01-01', endDate: '2028-12-31' }), lease({})],
      [],
      '2029-02-01'
    );
    expect(
      entries.filter((e) => e.kind === 'lease').map((e) => e.kind === 'lease' && e.number)
    ).toEqual([1, 2]);
    expect(entries.some((e) => e.kind === 'earlier')).toBe(false);
  });
});
