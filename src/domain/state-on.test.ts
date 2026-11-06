import { describe, expect, it } from 'vitest';
import {
  assetStateOn,
  contractOn,
  hasEventsAfter,
  type AssetEvent,
  type AssetSnapshot,
} from './state-on';

const fresh: AssetSnapshot = {
  status: 'available',
  condition: 'new',
  usageValue: 0,
  secondLifePriceCents: null,
  reservedFor: null,
};

// Leased 15 Sep 2026, returned 15 Sep 2027, refurbished 1 Oct 2027
const life: AssetEvent[] = [
  { date: '2027-10-01', kind: 'refurbished', condition: 'good', usageValue: 0, priceCents: 99_000 },
  { date: '2026-09-15', kind: 'leased' },
  { date: '2027-09-15', kind: 'closed', to: 'returned' },
];

describe('assetStateOn', () => {
  it('replays only the records up to the date', () => {
    expect(assetStateOn(fresh, life, '2026-09-14')).toEqual(fresh);
    expect(assetStateOn(fresh, life, '2026-09-15').status).toBe('leased');
    expect(assetStateOn(fresh, life, '2027-09-20').status).toBe('returned');
    expect(assetStateOn(fresh, life, '2027-10-01')).toEqual({
      status: 'available',
      condition: 'good',
      usageValue: 0,
      secondLifePriceCents: 99_000,
      reservedFor: null,
    });
  });

  it('reserves a refurbished item for the customer who accepted it, until they lease it', () => {
    const passedOn: AssetEvent[] = [
      { date: '2027-09-15', kind: 'closed', to: 'returned' },
      { date: '2027-09-16', kind: 'held_for', customerId: 'cust-lena' },
      { date: '2027-10-01', kind: 'refurbished', condition: 'good', usageValue: 0, priceCents: 1 },
      { date: '2027-10-05', kind: 'leased' },
    ];
    const start = { ...fresh, status: 'leased' as const };
    expect(assetStateOn(start, passedOn, '2027-10-02')).toMatchObject({
      status: 'reserved',
      reservedFor: 'cust-lena',
    });
    expect(assetStateOn(start, passedOn, '2027-10-05')).toMatchObject({
      status: 'leased',
      reservedFor: null,
    });
  });

  it('puts same-day records in a sensible order (returned, then refurbished, then leased)', () => {
    const sameDay: AssetEvent[] = [
      { date: '2027-01-01', kind: 'leased' },
      { date: '2027-01-01', kind: 'refurbished', condition: 'good', usageValue: 0, priceCents: 1 },
      { date: '2027-01-01', kind: 'closed', to: 'returned' },
    ];
    expect(assetStateOn({ ...fresh, status: 'leased' }, sameDay, '2027-01-01').status).toBe(
      'leased'
    );
  });

  it('ends at sold when the lessee bought it', () => {
    const bought: AssetEvent[] = [
      { date: '2026-01-01', kind: 'leased' },
      { date: '2027-01-01', kind: 'closed', to: 'sold' },
    ];
    expect(assetStateOn(fresh, bought, '2027-06-01').status).toBe('sold');
  });
});

describe('assetStateOn: letting a hold go', () => {
  const held: AssetEvent[] = [
    ...life,
    { date: '2027-09-20', kind: 'held_for', customerId: 'cust-lena' },
  ];

  it('frees a refurbished item when the customer changes their mind, from that day on', () => {
    const released: AssetEvent[] = [
      ...held,
      { date: '2027-10-10', kind: 'released', customerId: 'cust-lena' },
    ];
    expect(assetStateOn(fresh, released, '2027-10-05')).toMatchObject({
      status: 'reserved',
      reservedFor: 'cust-lena',
    });
    expect(assetStateOn(fresh, released, '2027-10-10')).toMatchObject({
      status: 'available',
      reservedFor: null,
    });
  });

  it('lets go before the refurbishment: it is refurbished for anyone', () => {
    const released: AssetEvent[] = [
      ...held,
      { date: '2027-09-25', kind: 'released', customerId: 'cust-lena' },
    ];
    expect(assetStateOn(fresh, released, '2027-09-26')).toMatchObject({
      status: 'returned',
      reservedFor: null,
    });
    expect(assetStateOn(fresh, released, '2027-10-01').status).toBe('available');
  });

  it('holds and refurbishes on the same day, and ignores a release by someone else', () => {
    const sameDay: AssetEvent[] = [
      ...life,
      { date: '2027-10-01', kind: 'held_for', customerId: 'cust-aino' },
      { date: '2027-10-01', kind: 'released', customerId: 'cust-lena' },
    ];
    expect(assetStateOn(fresh, sameDay, '2027-10-01')).toMatchObject({
      status: 'reserved',
      reservedFor: 'cust-aino',
    });
  });
});

describe('hasEventsAfter', () => {
  it('knows when the item has history later than the date', () => {
    expect(hasEventsAfter(life, '2027-09-30')).toBe(true);
    expect(hasEventsAfter(life, '2027-10-01')).toBe(false);
    expect(hasEventsAfter([], '2020-01-01')).toBe(false);
  });
});

describe('contractOn', () => {
  const returned = {
    id: 'c1',
    signedDate: '2026-09-15',
    status: 'returned',
    returnedDate: '2027-09-15',
    boughtDate: null,
  };

  it('does not exist before it was signed', () => {
    expect(contractOn(returned, '2026-09-14')).toBeNull();
  });

  it('is still running before the day it ended', () => {
    expect(contractOn(returned, '2027-01-01')).toEqual({
      ...returned,
      status: 'active',
      returnedDate: null,
    });
  });

  it('is as recorded from the day it ended', () => {
    expect(contractOn(returned, '2027-09-15')).toBe(returned);
    const bought = { ...returned, status: 'bought', returnedDate: null, boughtDate: '2027-09-15' };
    expect(contractOn(bought, '2027-09-14')?.status).toBe('active');
  });
});
