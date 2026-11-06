import { describe, expect, it } from 'vitest';
import { endOfTermFor, type EndOfTermInput } from './end-of-term';

const base: EndOfTermInput = {
  action: 'returned',
  contractStatus: 'active',
  endsOn: '2029-11-05',
  completedOn: '2029-11-05',
  outstandingRentCents: 0,
  buyoutCents: 58_350,
};

describe('endOfTermFor', () => {
  it('returns an asset to the returned pool', () => {
    expect(endOfTermFor(base)).toEqual({
      ok: true,
      action: 'returned',
      contractStatus: 'completed',
      assetStatus: 'returned',
      historyEvent: 'returned',
      buyoutPaidCents: null,
    });
  });

  it('distinguishes pass-on from a normal return in the passport event', () => {
    expect(endOfTermFor({ ...base, action: 'passed_on' })).toMatchObject({
      ok: true,
      action: 'passed_on',
      assetStatus: 'returned',
      historyEvent: 'passed_on',
    });
  });

  it('sells the asset only after the exact locked buyout is paid', () => {
    expect(endOfTermFor({ ...base, action: 'bought', buyoutPaidCents: 58_350 })).toEqual({
      ok: true,
      action: 'bought',
      contractStatus: 'completed',
      assetStatus: 'sold',
      historyEvent: 'bought_out',
      buyoutPaidCents: 58_350,
    });
  });

  it('allows completion on the exclusive end date but not before it', () => {
    expect(endOfTermFor({ ...base, completedOn: '2029-11-04' })).toEqual({
      ok: false,
      reason: 'term_not_finished',
      endsOn: '2029-11-05',
      completedOn: '2029-11-04',
    });
    expect(endOfTermFor({ ...base, completedOn: '2029-11-06' })).toMatchObject({ ok: true });
  });

  it('rejects inactive contracts and outstanding rent', () => {
    expect(endOfTermFor({ ...base, contractStatus: 'completed' })).toEqual({
      ok: false,
      reason: 'contract_not_active',
      status: 'completed',
    });
    expect(endOfTermFor({ ...base, outstandingRentCents: 1 })).toEqual({
      ok: false,
      reason: 'rent_balance_outstanding',
      outstandingRentCents: 1,
    });
  });

  it('rejects missing, partial, and non-buyout settlement amounts', () => {
    expect(endOfTermFor({ ...base, action: 'bought' })).toEqual({
      ok: false,
      reason: 'buyout_payment_required',
      expectedCents: 58_350,
    });
    expect(endOfTermFor({ ...base, action: 'bought', buyoutPaidCents: 58_349 })).toEqual({
      ok: false,
      reason: 'buyout_amount_mismatch',
      expectedCents: 58_350,
      receivedCents: 58_349,
    });
    expect(endOfTermFor({ ...base, buyoutPaidCents: 1 })).toEqual({
      ok: false,
      reason: 'buyout_not_allowed',
    });
  });
});
