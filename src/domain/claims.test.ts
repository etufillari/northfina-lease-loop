import { describe, expect, it } from 'vitest';
import { canClaim, type ClaimHold } from './claims';

const TODAY = '2026-11-06';
const hold = (kind: string, customerId: string | null, until = '2026-11-13'): ClaimHold => ({
  kind,
  customerId,
  until,
});

describe('canClaim', () => {
  it('an available item with no holds is open to anyone', () => {
    expect(canClaim({ status: 'available' }, [], 'aino', TODAY)).toEqual({ ok: true });
  });

  it('a leased or sold item is never claimable, whatever the holds say', () => {
    for (const status of ['leased', 'sold']) {
      expect(canClaim({ status }, [hold('approval_hold', 'aino')], 'aino', TODAY)).toEqual({
        ok: false,
        reason: 'leased_or_sold',
      });
    }
  });

  it('the race: once Olavi is approved, Aino cannot submit or sign for the same item', () => {
    const held = [hold('approval_hold', 'olavi')];
    expect(canClaim({ status: 'reserved' }, held, 'aino', TODAY)).toEqual({
      ok: false,
      reason: 'held_for_someone_else',
    });
    expect(canClaim({ status: 'reserved' }, held, 'olavi', TODAY)).toEqual({ ok: true });
  });

  it('any live hold for someone else blocks, even on an item marked available', () => {
    expect(canClaim({ status: 'available' }, [hold('nomination', 'sanna')], 'aino', TODAY)).toEqual(
      { ok: false, reason: 'held_for_someone_else' }
    );
  });

  it('a nomination of someone without an account blocks everyone else', () => {
    expect(canClaim({ status: 'returned' }, [hold('nomination', null)], 'aino', TODAY)).toEqual({
      ok: false,
      reason: 'held_for_someone_else',
    });
  });

  it('a returned item is in maintenance — except for the successor nominated for it', () => {
    expect(canClaim({ status: 'returned' }, [], 'sanna', TODAY)).toEqual({
      ok: false,
      reason: 'in_maintenance',
    });
    expect(canClaim({ status: 'returned' }, [hold('nomination', 'sanna')], 'sanna', TODAY)).toEqual(
      { ok: true }
    );
    // Her own approval hold is not a nomination: it does not open a returned item.
    expect(
      canClaim({ status: 'returned' }, [hold('approval_hold', 'sanna')], 'sanna', TODAY)
    ).toEqual({ ok: false, reason: 'in_maintenance' });
  });

  it('a reserved item with no hold for this customer is not theirs', () => {
    expect(canClaim({ status: 'reserved' }, [], 'aino', TODAY)).toEqual({
      ok: false,
      reason: 'held_for_someone_else',
    });
  });

  it('a hold past its last day no longer counts, even before the lapse job runs', () => {
    const lapsed = [hold('approval_hold', 'olavi', '2026-11-05')];
    expect(canClaim({ status: 'available' }, lapsed, 'aino', TODAY)).toEqual({ ok: true });
    // Its last day itself still counts.
    const lastDay = [hold('approval_hold', 'olavi', TODAY)];
    expect(canClaim({ status: 'available' }, lastDay, 'aino', TODAY)).toEqual({
      ok: false,
      reason: 'held_for_someone_else',
    });
  });
});
