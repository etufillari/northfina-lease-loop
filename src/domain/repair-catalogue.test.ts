import { describe, expect, it } from 'vitest';
import { MAX_REPAIR_LINES, repairLines } from './repair-catalogue';

describe('repairLines', () => {
  it('prices presets from the standard list and adds custom lines', () => {
    expect(
      repairLines('e_bike', ['tyres', 'brakes'], [{ label: '  New saddle ', costCents: 2_500 }])
    ).toEqual({
      ok: true,
      lines: [
        { presetId: 'tyres', label: null, costCents: 6_000 },
        { presetId: 'brakes', label: null, costCents: 4_000 },
        { presetId: null, label: 'New saddle', costCents: 2_500 },
      ],
      costCents: 12_500,
    });
  });

  it('counts a preset chosen twice once', () => {
    expect(repairLines('laptop', ['keyboard', 'keyboard'], [])).toMatchObject({
      ok: true,
      costCents: 9_000,
    });
  });

  it('has nothing to add when nothing is chosen', () => {
    expect(repairLines('farm_machine', [], [])).toEqual({ ok: true, lines: [], costCents: 0 });
  });

  it('refuses a preset from another kind of item, or one that doesn’t exist', () => {
    expect(repairLines('laptop', ['tyres'], [])).toEqual({ ok: false, reason: 'unknown_preset' });
    expect(repairLines('e_bike', ['warp_drive'], [])).toEqual({
      ok: false,
      reason: 'unknown_preset',
    });
  });

  it('refuses custom lines without a name, with a bad price, or too many lines', () => {
    for (const custom of [
      { label: ' ', costCents: 100 },
      { label: 'x'.repeat(81), costCents: 100 },
      { label: 'Glue', costCents: -1 },
      { label: 'Glue', costCents: 10.5 },
      { label: 'Gold plating', costCents: 10_000_001 },
    ]) {
      expect(repairLines('e_bike', [], [custom])).toEqual({ ok: false, reason: 'invalid_custom' });
    }
    const many = Array.from({ length: MAX_REPAIR_LINES + 1 }, () => ({ label: 'x', costCents: 1 }));
    expect(repairLines('e_bike', [], many)).toEqual({ ok: false, reason: 'too_many' });
  });
});
