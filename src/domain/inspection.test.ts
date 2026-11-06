import { describe, expect, it } from 'vitest';
import {
  conditionsUpTo,
  evaluateInspection,
  inspectionChecks,
  inspectionReadings,
  reportedCheckIds,
  reportedRepairCents,
  type CheckResult,
  type InspectionRecord,
} from './inspection';

function record(
  overrides: Record<string, { result: CheckResult; repairCents?: number }> = {},
  extra: Partial<InspectionRecord> = {}
): InspectionRecord {
  return {
    usageSource: 'display',
    customerPresent: false,
    readings: [],
    damage: [],
    checks: inspectionChecks('e_bike').map(({ id }) => ({
      id,
      result: overrides[id]?.result ?? 'pass',
      repairCents: overrides[id]?.repairCents ?? 0,
      note: '',
    })),
    ...extra,
  };
}

describe('inspection checklists', () => {
  it.each(['e_bike', 'laptop', 'farm_machine'] as const)(
    'gives %s unique checks and measured readings',
    (category) => {
      const ids = inspectionChecks(category).map((check) => check.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('serial_match');
      expect(inspectionReadings(category).length).toBeGreaterThan(0);
    }
  );

  it('points a customer report at the matching checks for that category only', () => {
    expect(reportedCheckIds('e_bike', ['brakes_fault', 'unknown_issue'])).toEqual(['brakes']);
    expect(reportedCheckIds('laptop', ['brakes_fault'])).toEqual([]);
    expect(reportedCheckIds('laptop', ['not_working', 'battery_weak'])).toEqual([
      'power_on',
      'battery_pack',
    ]);
  });
});

describe('evaluateInspection', () => {
  it('allows like new when everything meets the standard, but never new', () => {
    const result = evaluateInspection('e_bike', record());
    expect(result).toMatchObject({ ok: true, conditionCap: 'like_new', repairNetCents: 0 });
    expect(conditionsUpTo(result.conditionCap)).not.toContain('new');
  });

  it('lets the worst finding cap the condition', () => {
    const cap = (id: string, result: CheckResult) =>
      evaluateInspection('e_bike', record({ [id]: { result } })).conditionCap;
    expect(cap('tyres', 'wear')).toBe('good');
    expect(cap('accessories_complete', 'repair')).toBe('good');
    expect(cap('tyres', 'repair')).toBe('fair');
    expect(cap('brakes', 'repair')).toBe('fair');
    expect(cap('frame_fork', 'repair')).toBe('poor');
    expect(cap('serial_match', 'repair')).toBe('poor');
    expect(cap('wheels', 'not_applicable')).toBe('like_new');
    expect(cap('wheels', 'not_tested')).toBe('like_new');
  });

  it('caps at good for any logged damage, whoever is responsible', () => {
    const result = evaluateInspection(
      'e_bike',
      record(
        {},
        {
          damage: [{ area: 'Top tube', type: 'scratch', liability: 'existing', repairCents: 0 }],
        }
      )
    );
    expect(result.conditionCap).toBe('good');
    expect(result.chargeableNetCents).toBe(0);
  });

  it('totals repairs and separates what the customer is responsible for', () => {
    const result = evaluateInspection(
      'e_bike',
      record(
        { brakes: { result: 'repair', repairCents: 3000 } },
        {
          damage: [
            { area: 'Fork', type: 'dent', liability: 'chargeable', repairCents: 5000 },
            { area: 'Saddle', type: 'other', liability: 'fair_wear', repairCents: 700 },
          ],
        }
      )
    );
    expect(result).toMatchObject({ repairNetCents: 8700, chargeableNetCents: 8000 });
  });

  it("leaves out repairs marked as not the customer's", () => {
    const base = record({ brakes: { result: 'repair', repairCents: 3000 } });
    const result = evaluateInspection('e_bike', {
      ...base,
      checks: base.checks.map((check) =>
        check.id === 'brakes' ? { ...check, chargeable: false } : check
      ),
    });
    expect(result).toMatchObject({ repairNetCents: 3000, chargeableNetCents: 0 });
  });

  it('lists repairs and untested checks as open until re-tested', () => {
    const result = evaluateInspection(
      'e_bike',
      record({ brakes: { result: 'repair' }, charging: { result: 'not_tested' } })
    );
    expect(result.ok).toBe(true);
  });

  it('rejects incomplete or contradictory records', () => {
    const complete = record();
    expect(
      evaluateInspection('e_bike', { ...complete, checks: complete.checks.slice(1) })
    ).toMatchObject({ ok: false, missingChecks: ['serial_match'] });
    const invalid = (overrides: Parameters<typeof record>[0], extra = {}) =>
      evaluateInspection('e_bike', record(overrides, extra)).ok;
    expect(invalid({ tyres: { result: 'pass', repairCents: 100 } })).toBe(false);
    expect(invalid({ tyres: { result: 'repair', repairCents: 1.5 } })).toBe(false);
    expect(invalid({ serial_match: { result: 'not_applicable' } })).toBe(false);
    expect(invalid({ serial_match: { result: 'wear' } })).toBe(false);
    expect(
      invalid({}, { damage: [{ area: ' ', type: 'dent', liability: 'existing', repairCents: 0 }] })
    ).toBe(false);
    expect(
      evaluateInspection('e_bike', {
        ...complete,
        checks: [
          ...complete.checks,
          { id: 'hydraulics', result: 'pass', repairCents: 0, note: '' },
        ],
      }).invalidChecks
    ).toEqual(['hydraulics']);
    expect(
      evaluateInspection('e_bike', {
        ...complete,
        checks: [...complete.checks, complete.checks[0]!],
      }).invalidChecks
    ).toEqual(['serial_match']);
  });

  it('checks readings against the category and their range, allowing not measured', () => {
    const readings = (id: string, value: number | null) =>
      evaluateInspection('e_bike', record({}, { readings: [{ id, value }] })).invalidReadings;
    expect(readings('battery_health', 100)).toEqual([]);
    expect(readings('battery_health', null)).toEqual([]);
    expect(readings('battery_health', 101)).toEqual(['battery_health']);
    expect(readings('battery_health', -1)).toEqual(['battery_health']);
    expect(readings('battery_health', Number.NaN)).toEqual(['battery_health']);
    expect(readings('hydraulic_pressure', 100)).toEqual(['hydraulic_pressure']);
  });
});

describe('reportedRepairCents', () => {
  const lines = [
    { id: 'keyboard_fault', netCents: 4000 },
    { id: 'speed_fault', netCents: 8000 },
  ];

  it('suggests what the customer was quoted for that part', () => {
    expect(reportedRepairCents('keyboard', lines)).toBe(4000);
  });

  it('puts a fault that touches two checks on its first check only', () => {
    expect(reportedRepairCents('storage', lines)).toBe(8000);
    expect(reportedRepairCents('power_on', lines)).toBeNull();
  });

  it('has no suggestion for a part the customer did not report', () => {
    expect(reportedRepairCents('display', lines)).toBeNull();
    expect(reportedRepairCents('display', [])).toBeNull();
  });
});
