import { describe, expect, it } from 'vitest';
import type { InspectionCheck, InspectionRecord } from './inspection';
import { batteryAfterWork, itemChanges } from './item-changes';

function record(
  checks: Partial<InspectionCheck>[] = [],
  extra: Partial<InspectionRecord> = {}
): InspectionRecord {
  return {
    customerPresent: false,
    checks: checks.map((check) => ({
      id: 'keyboard',
      result: 'repair',
      repairCents: 0,
      note: '',
      ...check,
    })),
    readings: [],
    damage: [],
    ...extra,
  };
}
const base = { condition: 'good' as const, targetCondition: 'good' as const, workItems: [] };

describe('itemChanges', () => {
  it('names each part with what happened to it', () => {
    expect(
      itemChanges({
        ...base,
        record: record([
          { id: 'keyboard' },
          { id: 'battery_pack' },
          { id: 'accessories_complete' },
          { id: 'service_records' },
        ]),
      })
    ).toEqual([
      { kind: 'part', checkId: 'keyboard', action: 'repaired' },
      { kind: 'part', checkId: 'battery_pack', action: 'replaced' },
      { kind: 'part', checkId: 'accessories_complete', action: 'replaced' },
      { kind: 'part', checkId: 'service_records', action: 'updated' },
    ]);
  });

  it('leaves out passed checks and a serial number mismatch', () => {
    expect(
      itemChanges({
        ...base,
        record: record([
          { id: 'display', result: 'pass' },
          { id: 'trackpad', result: 'wear' },
          { id: 'serial_match' },
        ]),
      })
    ).toEqual([]);
  });

  it('never carries free-text notes', () => {
    const changes = itemChanges({
      ...base,
      record: record([{ id: 'keyboard', note: 'Private note about the customer' }]),
    });
    expect(JSON.stringify(changes)).not.toContain('Private');
  });

  it('lists damage only when work was done on it', () => {
    const damage = [
      { area: 'Lid', type: 'dent' as const, liability: 'chargeable' as const, repairCents: 100 },
      { area: 'Base', type: 'scratch' as const, liability: 'fair_wear' as const, repairCents: 0 },
    ];
    expect(itemChanges({ ...base, record: record([], { damage }) })).toEqual([
      { kind: 'damage', area: 'Lid', type: 'dent' },
    ]);
  });

  it('shows several condition upgrades as one step', () => {
    const workItems = [
      { id: 'poor->fair', reason: 'condition_upgrade' },
      { id: 'fair->good', reason: 'condition_upgrade' },
      { id: 'certified_data_wipe', reason: 'required_before_lease' },
    ];
    expect(
      itemChanges({ condition: 'poor', targetCondition: 'good', workItems, record: record() })
    ).toEqual([
      { kind: 'condition', from: 'poor', to: 'good' },
      { kind: 'task', id: 'certified_data_wipe' },
    ]);
  });

  it('shows no condition step when the grade did not change', () => {
    expect(itemChanges({ ...base, record: record() })).toEqual([]);
  });

  it('names the repairs instead of their total, unless only the total exists', () => {
    const workItems = [{ id: 'additional_repair', reason: 'professional_quote' }];
    expect(itemChanges({ ...base, workItems, record: record() })).toEqual([]);
    expect(itemChanges({ ...base, workItems, record: undefined })).toEqual([
      { kind: 'task', id: 'additional_repair' },
    ]);
  });

  it('lists a replaced battery once when both the check and the usage rule call for it', () => {
    const workItems = [{ id: 'battery_replacement', reason: 'maintenance_threshold' }];
    expect(itemChanges({ ...base, workItems, record: record([{ id: 'battery_pack' }]) })).toEqual([
      { kind: 'part', checkId: 'battery_pack', action: 'replaced' },
    ]);
    expect(itemChanges({ ...base, workItems, record: record() })).toEqual([
      { kind: 'task', id: 'battery_replacement' },
    ]);
  });
});

describe('batteryAfterWork', () => {
  const measured = record([], { readings: [{ id: 'battery_health', value: 87 }] });

  it('reports the measured health', () => {
    expect(batteryAfterWork([], measured)).toEqual({ kind: 'measured', percent: 87 });
  });

  it('says new when replaced, whatever the old reading was', () => {
    expect(batteryAfterWork([{ id: 'battery_replacement' }], measured)).toEqual({ kind: 'new' });
    expect(
      batteryAfterWork(
        [],
        record([{ id: 'battery_pack' }], { readings: [{ id: 'battery_health', value: 61 }] })
      )
    ).toEqual({ kind: 'new' });
  });

  it('does not count a battery check that passed as a replacement', () => {
    expect(
      batteryAfterWork(
        [],
        record([{ id: 'battery_pack', result: 'pass' }], {
          readings: [{ id: 'battery_health', value: 90 }],
        })
      )
    ).toEqual({ kind: 'measured', percent: 90 });
  });

  it('knows nothing without a reading or a replacement', () => {
    expect(
      batteryAfterWork([], record([], { readings: [{ id: 'battery_health', value: null }] }))
    ).toBeNull();
    expect(batteryAfterWork([], undefined)).toBeNull();
  });

  it('keeps a measured zero rather than treating it as unknown', () => {
    expect(
      batteryAfterWork([], record([], { readings: [{ id: 'battery_health', value: 0 }] }))
    ).toEqual({ kind: 'measured', percent: 0 });
  });
});
