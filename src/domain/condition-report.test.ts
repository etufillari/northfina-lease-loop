import { expect, expectTypeOf, it } from 'vitest';
import costsData from '../../data/refurbishment-costs.json';
import { refurbishmentCostsSchema, type AssetCondition } from '@/data/schemas';
import {
  conditionReport,
  conditionDamageCost,
  repairLines,
  answerOptions,
  type ConditionAnswers,
} from './condition-report';
const costs = refurbishmentCostsSchema.parse(costsData);
const answers: ConditionAnswers = {
  power: 'working',
  batteryKnown: false,
  batteryHealth: null,
  functions: {
    screen_damage: 'working',
    keyboard_fault: 'working',
    charging_fault: 'working',
    network_fault: 'working',
    cooling_fault: 'working',
    speed_fault: 'working',
    camera_audio_fault: 'working',
    hinge_fault: 'working',
    liquid_fault: 'working',
  },
  cosmetic: 'same',
  accessories: 'complete',
};
it.each(['new', 'like_new'] as const)(
  'reports an undamaged %s item as like new without a damage charge',
  (baseline) => {
    const result = conditionReport(
      'laptop',
      baseline,
      { ...answers, batteryKnown: true, batteryHealth: 95 },
      costs
    );
    expectTypeOf(result.condition).toEqualTypeOf<Exclude<AssetCondition, 'new'>>();
    expect(result).toMatchObject({
      condition: 'like_new',
      issues: [],
      damageNetCents: 0,
      inspectionRequired: false,
    });
  }
);
it('does not charge pre-existing wear or ordinary light use', () => {
  expect(conditionDamageCost('fair', 'fair', costs.laptop)).toBe(0);
  expect(
    conditionReport('laptop', 'like_new', { ...answers, cosmetic: 'light' }, costs).damageNetCents
  ).toBe(0);
});
it('prices new cosmetic damage separately and flags unknown repair costs', () => {
  const result = conditionReport(
    'laptop',
    'good',
    {
      ...answers,
      cosmetic: 'deep',
      functions: { ...answers.functions, screen_damage: 'fault' },
    },
    costs
  );
  expect(result.damageNetCents).toBe(7500);
  expect(result.condition).toBe('fair');
  expect(result.inspectionRequired).toBe(true);
});
it('validates battery and all applicable checks', () => {
  expect(() =>
    conditionReport('laptop', 'good', { ...answers, batteryKnown: true, batteryHealth: 101 }, costs)
  ).toThrow();
  expect(() => conditionReport('e_bike', 'good', answers, costs)).toThrow();
});
it('grades by the worst answer, and only visible breakage reaches poor', () => {
  const grade = (change: Partial<ConditionAnswers>, baseline: 'new' | 'good' = 'new') =>
    conditionReport('laptop', baseline, { ...answers, ...change }, costs).condition;
  expect(grade({})).toBe('like_new');
  expect(grade({ functions: { ...answers.functions, liquid_fault: 'fault' } })).toBe('fair');
  expect(grade({ functions: { ...answers.functions, keyboard_fault: 'minor' } })).toBe('good');
  expect(grade({ cosmetic: 'broken' })).toBe('poor');
});
it('reports a partial problem for inspection', () => {
  const report = conditionReport(
    'laptop',
    'new',
    { ...answers, functions: { ...answers.functions, keyboard_fault: 'minor' } },
    costs
  );
  expect(report.issues).toContain('keyboard_fault');
  expect(report.inspectionRequired).toBe(true);
});
it('lists each repair with its part cost, for laptops', () => {
  const lines = repairLines(
    'laptop',
    150000,
    {
      ...answers,
      functions: { ...answers.functions, network_fault: 'minor', speed_fault: 'fault' },
    },
    12,
    costs
  );
  expect(lines).toEqual([
    { id: 'network_fault', netCents: 2000 },
    { id: 'speed_fault', netCents: 30000 },
  ]);
});
it('keeps percentage estimates for the other categories', () => {
  const lines = repairLines(
    'e_bike',
    200000,
    { ...answers, power: 'fault', functions: { brakes_fault: 'minor' } },
    12,
    costs
  );
  expect(lines).toEqual([
    { id: 'power', netCents: 40000 },
    { id: 'brakes_fault', netCents: 2000 },
  ]);
  expect(() => repairLines('laptop', -1, answers, 1, costs)).toThrow(RangeError);
});
it('offers only answers that make sense', () => {
  expect(answerOptions('liquid_fault')).not.toContain('minor');
  expect(answerOptions('screen_damage')).toContain('minor');
});
