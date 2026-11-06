import { describe, expect, it } from 'vitest';
import { soldTally, type SaleSource } from './sold';

const contract = (overrides: Partial<SaleSource>): SaleSource => ({
  id: 'c1',
  assetId: 'ebike-003',
  customerName: 'Aino Virtanen',
  status: 'active',
  boughtDate: null,
  buyoutPaidCents: null,
  exitedEarlyDate: null,
  ...overrides,
});

describe('soldTally', () => {
  it('is empty when nothing was bought', () => {
    expect(soldTally([contract({}), contract({ id: 'c2', status: 'returned' })])).toEqual({
      count: 0,
      paidCents: 0,
      sales: [],
    });
  });

  it('counts bought items, adds up what was paid, newest first', () => {
    const tally = soldTally([
      contract({
        id: 'a',
        assetId: 'ebike-003',
        status: 'bought',
        boughtDate: '2029-11-06',
        buyoutPaidCents: 72_563,
      }),
      contract({ id: 'b', status: 'active' }),
      contract({
        id: 'c',
        assetId: 'laptop-005',
        customerName: 'Mikko',
        status: 'bought',
        boughtDate: '2027-05-20',
        buyoutPaidCents: 310_050,
        exitedEarlyDate: '2027-05-20',
      }),
    ]);
    expect(tally.count).toBe(2);
    expect(tally.paidCents).toBe(382_613);
    expect(tally.sales.map((s) => [s.assetId, s.early])).toEqual([
      ['ebike-003', false],
      ['laptop-005', true],
    ]);
  });

  it('ignores a "bought" contract with no date', () => {
    expect(soldTally([contract({ status: 'bought' })]).count).toBe(0);
  });
});
