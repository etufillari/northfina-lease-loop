// D22's asset status transitions, the rule the admin route checks before it writes
// (wave 1 finding 5: the route used to allow any status to any status).
import { describe, expect, it } from 'vitest';
import { assetStatusSchema } from '@/data/schemas';
import {
  ASSET_STATUS_TRANSITIONS,
  checkAssetStatusChange,
  checkManualAssetStatusChange,
} from './transitions';

describe('checkAssetStatusChange (D22)', () => {
  it.each([
    ['available', 'reserved'],
    ['available', 'leased'],
    ['reserved', 'available'],
    ['leased', 'returned'],
    ['leased', 'sold'],
    ['returned', 'available'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(checkAssetStatusChange(from, to)).toEqual({ ok: true });
  });

  it.each([
    ['sold', 'available'],
    ['sold', 'leased'],
    ['available', 'sold'],
    ['available', 'returned'],
    ['reserved', 'leased'],
    ['returned', 'leased'],
    ['leased', 'available'],
  ] as const)('refuses %s → %s with a code and both statuses', (from, to) => {
    expect(checkAssetStatusChange(from, to)).toEqual({
      ok: false,
      reason: { code: 'transition_not_allowed', params: { from, to } },
    });
  });

  it('refuses a change to the same status: nothing to change', () => {
    for (const status of assetStatusSchema.options) {
      expect(checkAssetStatusChange(status, status)).toMatchObject({
        ok: false,
        reason: { code: 'transition_not_allowed' },
      });
    }
  });

  it('has a row for every status and nothing out of sold', () => {
    expect(Object.keys(ASSET_STATUS_TRANSITIONS).sort()).toEqual(
      [...assetStatusSchema.options].sort()
    );
    expect(ASSET_STATUS_TRANSITIONS.sold).toEqual([]);
  });

  it('parses both values first, so a status outside the list throws', () => {
    expect(() => checkAssetStatusChange('stolen', 'available')).toThrow();
    expect(() => checkAssetStatusChange('available', 'stolen')).toThrow();
  });
});

describe('checkManualAssetStatusChange: what an admin may change by hand (product review 4)', () => {
  it.each([
    ['available', 'reserved'],
    ['reserved', 'available'],
  ] as const)('allows %s → %s by hand', (from, to) => {
    expect(checkManualAssetStatusChange(from, to)).toEqual({ ok: true });
  });

  it.each([
    ['leased', 'returned'],
    ['leased', 'sold'],
    ['available', 'leased'],
    ['returned', 'available'],
  ] as const)(
    'refuses %s → %s by hand: only signing, an exit or an assessment does it',
    (from, to) => {
      expect(checkManualAssetStatusChange(from, to)).toEqual({
        ok: false,
        reason: { code: 'transition_by_event_only', params: { from, to } },
      });
    }
  );

  it('keeps D22 refusals as they were for a change no event makes either', () => {
    expect(checkManualAssetStatusChange('sold', 'available')).toEqual({
      ok: false,
      reason: { code: 'transition_not_allowed', params: { from: 'sold', to: 'available' } },
    });
  });
});
