import { describe, expect, it } from 'vitest';
import curvesData from '../../data/residual-curves.json';
import costsData from '../../data/refurbishment-costs.json';
import { refurbishmentCostsSchema, residualCurvesSchema } from '@/data/schemas';
import {
  assetRecovery,
  recoveryAgeMonths,
  recoveryFirstUseDate,
  type RecoveryInput,
} from './asset-recovery';

const curves = residualCurvesSchema.parse(curvesData);
const costs = refurbishmentCostsSchema.parse(costsData);
const input: RecoveryInput = {
  category: 'e_bike',
  originalPriceCents: 389000,
  ageMonths: 12,
  condition: 'fair',
  targetCondition: 'good',
  usageValue: 2000,
  maintenanceUsageValue: 0,
  additionalRepairCents: 0,
};
const recover = (changes: Partial<RecoveryInput> = {}) =>
  assetRecovery({ ...input, ...changes }, curves, costs);

describe('assetRecovery', () => {
  it('values the inspected item and repaired condition independently of repair spending', () => {
    expect(recover()).toMatchObject({
      asReturnedValueCents: 169915,
      postRepairValueCents: 222197,
      refurbishmentCostCents: 16500,
      netRecoveryCents: 205697,
      valueUpliftCents: 52282,
      policyVersion: 'recovery-v1',
      workItems: [
        { id: 'fair->good', costCents: 12000 },
        { id: 'safety_inspection', costCents: 4500 },
      ],
    });
    expect(recover({ additionalRepairCents: 20000 })).toMatchObject({
      postRepairValueCents: 222197,
      refurbishmentCostCents: 36500,
      netRecoveryCents: 185697,
    });
  });

  it('interpolates age without rounding intermediate money and holds the final curve point', () => {
    expect(recover({ ageMonths: 9, usageValue: 0, condition: 'good' }).postRepairValueCents).toBe(
      251294
    );
    expect(recover({ ageMonths: 60 }).postRepairValueCents).toBe(
      recover({ ageMonths: 600 }).postRepairValueCents
    );
  });

  it('applies usage deductions per complete step and caps them', () => {
    expect(recover({ usageValue: 999 }).postRepairValueCents).toBe(231455);
    expect(recover({ usageValue: 1000 }).postRepairValueCents).toBe(226826);
    expect(recover({ usageValue: 10000 }).postRepairValueCents).toBe(
      recover({ usageValue: 50000 }).postRepairValueCents
    );
  });

  it('adds all chained upgrades and category-mandatory work', () => {
    const result = recover({
      category: 'laptop',
      condition: 'poor',
      targetCondition: 'like_new',
      usageValue: 500,
    });
    expect(result.workItems).toEqual([
      { id: 'poor->fair', costCents: 9000, reason: 'condition_upgrade' },
      { id: 'fair->good', costCents: 7500, reason: 'condition_upgrade' },
      { id: 'good->like_new', costCents: 5000, reason: 'condition_upgrade' },
      { id: 'certified_data_wipe', costCents: 2500, reason: 'required_before_lease' },
      { id: 'battery_replacement', costCents: 9000, reason: 'maintenance_threshold' },
    ]);
  });

  it('uses maintenance counters for battery thresholds without erasing lifetime wear', () => {
    const before = recover({ usageValue: 15000 });
    const after = recover({ usageValue: 15000, maintenanceUsageValue: 15000 });
    expect(before.workItems.some((task) => task.id === 'battery_replacement')).toBe(true);
    expect(after.workItems.some((task) => task.id === 'battery_replacement')).toBe(false);
    expect(before.postRepairValueCents).toBe(after.postRepairValueCents);
    expect(
      recover({ usageValue: 14999 }).workItems.some((task) => task.id === 'battery_replacement')
    ).toBe(false);
  });

  it('charges farm servicing per started 1000 hours since its recorded last service', () => {
    const result = recover({
      category: 'farm_machine',
      condition: 'good',
      usageValue: 2001,
      maintenanceUsageValue: 1000,
    });
    expect(result.workItems).toContainEqual({
      id: 'major_service',
      costCents: 300000,
      reason: 'maintenance_threshold',
    });
    expect(result.workItems).toContainEqual({
      id: 'safety_inspection',
      costCents: 40000,
      reason: 'required_before_lease',
    });
    expect(
      recover({
        category: 'farm_machine',
        condition: 'good',
        usageValue: 1000,
        maintenanceUsageValue: 1000,
      }).workItems.map((task) => task.id)
    ).toEqual(['safety_inspection']);
  });

  it('does not allow negative recovery proceeds when repairs exceed value', () => {
    expect(recover({ additionalRepairCents: 10000000 }).netRecoveryCents).toBe(0);
  });

  it.each([
    { originalPriceCents: -1 },
    { ageMonths: -1 },
    { ageMonths: 0.5 },
    { usageValue: -1 },
    { maintenanceUsageValue: 2001 },
    { additionalRepairCents: -1 },
    { additionalRepairCents: 0.5 },
    { targetCondition: 'fair' },
    { targetCondition: 'new' },
    { condition: 'like_new', targetCondition: 'good' },
  ] as Partial<RecoveryInput>[])(
    'rejects invalid facts or unsupported condition changes: %j',
    (changes) => {
      expect(() => recover(changes)).toThrow(RangeError);
    }
  );

  it('rejects incomplete cost or curve policies rather than publishing a partial quote', () => {
    const incomplete = structuredClone(costs);
    delete incomplete.e_bike.condition_upgrades['fair->good'];
    expect(() => assetRecovery(input, curves, incomplete)).toThrow(
      'Missing condition upgrade cost'
    );
    const badCurves = structuredClone(curves);
    badCurves.curves.e_bike = [
      [12, 70],
      [6, 82],
    ];
    expect(() => assetRecovery(input, badCurves, costs)).toThrow('Invalid age curve');
  });

  it('records and reuses a first-use baseline with short-month and leap-year handling', () => {
    expect(recoveryFirstUseDate('2026-11-06', 12)).toBe('2025-11-06');
    expect(recoveryFirstUseDate('2026-03-31', 1)).toBe('2026-02-28');
    expect(recoveryFirstUseDate('2024-03-31', 1)).toBe('2024-02-29');
    expect(recoveryAgeMonths('2026-01-31', '2026-02-28')).toBe(1);
    expect(recoveryAgeMonths('2024-01-31', '2024-02-28')).toBe(0);
    expect(recoveryAgeMonths('2024-01-31', '2024-02-29')).toBe(1);
    expect(recoveryAgeMonths('2025-11-06', '2026-11-05')).toBe(11);
    expect(recoveryAgeMonths('2025-11-06', '2026-11-06')).toBe(12);
    expect(recoveryAgeMonths('2025-11-06', '2026-11-07')).toBe(12);
  });

  it('rejects invalid or impossible recovery baseline dates', () => {
    expect(() => recoveryFirstUseDate('2026-02-29', 1)).toThrow(RangeError);
    expect(() => recoveryFirstUseDate('2026-13-01', 1)).toThrow(RangeError);
    expect(() => recoveryFirstUseDate('2026-11-06', -1)).toThrow(RangeError);
    expect(() => recoveryFirstUseDate('0001-01-01', 1)).toThrow(RangeError);
    expect(() => recoveryAgeMonths('2026-11-07', '2026-11-06')).toThrow(RangeError);
    expect(() => recoveryAgeMonths('2026-11-06', 'not a date')).toThrow(RangeError);
  });
});
