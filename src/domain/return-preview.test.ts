import { describe, expect, it } from 'vitest';
import curvesData from '../../data/residual-curves.json';
import costsData from '../../data/refurbishment-costs.json';
import { refurbishmentCostsSchema, residualCurvesSchema } from '@/data/schemas';
import type { ConditionAnswers } from './condition-report';
import { assessmentPreview, returnPreview, returnPreviewAtMonth } from './return-preview';

const context = {
  baselineCondition: 'new' as const,
  recoveryFacts: {
    category: 'laptop' as const,
    originalPriceCents: 200000,
    ageMonths: 6,
    maintenanceUsageValue: 0,
  },
  finance: {
    monthlyNetCents: 5500,
    buyoutCents: 30000,
    remainingMonths: 30,
    annualRateBasisPoints: 790,
    recoveryCents: 0,
    vatBasisPoints: 2550,
    outstandingCents: 1000,
    termMonths: 36,
  },
  costs: refurbishmentCostsSchema.parse(costsData),
  curves: residualCurvesSchema.parse(curvesData),
};
const working = {
  screen_damage: 'working',
  keyboard_fault: 'working',
  charging_fault: 'working',
  network_fault: 'working',
  cooling_fault: 'working',
  speed_fault: 'working',
  camera_audio_fault: 'working',
  hinge_fault: 'working',
  liquid_fault: 'working',
} as const;
const clean: ConditionAnswers = {
  power: 'unknown',
  batteryKnown: false,
  batteryHealth: null,
  functions: { ...working },
  cosmetic: 'same',
  accessories: 'complete',
};
const pay = (change: Partial<ConditionAnswers> = {}, finance = {}, facts = {}) =>
  returnPreview(
    {
      ...context,
      recoveryFacts: { ...context.recoveryFacts, ...facts },
      finance: { ...context.finance, ...finance },
    },
    { ...clean, ...change },
    40
  );
const broken = (part: keyof typeof working, answer: 'minor' | 'fault' = 'fault') => ({
  functions: { ...working, [part]: answer },
});

describe('what the customer pays', () => {
  it('adds ending early, their share of repairs and unpaid rent', () => {
    const result = pay(broken('screen_damage'));
    expect(result.returnTotalCents).toBeGreaterThanOrEqual(
      result.earlyReturnTotalCents + result.customerRepairTotalCents + result.unpaidCents - 1
    );
    expect(result.returnTotalCents).toBeLessThanOrEqual(
      result.earlyReturnTotalCents + result.customerRepairTotalCents + result.unpaidCents + 1
    );
  });

  it('uses the real cost of each part, so a Wi-Fi card costs far less than a motherboard', () => {
    const cost = (part: keyof typeof working) => pay(broken(part)).repairsTotalCents;
    expect(cost('network_fault')).toBe(5020);
    expect(cost('screen_damage')).toBe(50200);
    expect(cost('speed_fault')).toBe(75300);
    expect(cost('network_fault')).toBeLessThan(cost('screen_damage'));
  });

  it('moves with every answer, and scales with the laptop', () => {
    const screen = broken('screen_damage').functions;
    expect(
      pay({ functions: { ...screen, keyboard_fault: 'fault' } }).repairsTotalCents
    ).toBeGreaterThan(pay({ functions: screen }).repairsTotalCents);
    expect(pay(broken('screen_damage'), {}, { originalPriceCents: 60000 }).repairsTotalCents).toBe(
      10040
    );
  });

  it('charges a broken item even at the end of the lease, at half the repair', () => {
    const atEnd = pay(broken('screen_damage'), { remainingMonths: 0, outstandingCents: 0 });
    expect(atEnd.earlyReturnTotalCents).toBe(0);
    expect(atEnd.repairSharePercent).toBe(50);
    expect(atEnd.returnTotalCents).toBe(25100);
  });

  it('charges nothing for an item back as it came, at the end', () => {
    expect(pay({}, { remainingMonths: 0, outstandingCents: 0 }).returnTotalCents).toBe(0);
  });

  it('charges more for leaving at month 2 than at month 30', () => {
    const at = (month: number) =>
      returnPreviewAtMonth(context, { ...clean, ...broken('screen_damage') }, 40, month);
    expect(at(2).returnTotalCents).toBeGreaterThan(at(30).returnTotalCents);
    expect(at(2).repairSharePercent).toBeGreaterThan(at(30).repairSharePercent);
    expect(at(2).unpaidCents).toBe(0);
    expect(at(99).remainingMonths).toBe(0);
    expect(at(-5).remainingMonths).toBe(36);
  });

  it('never charges more for repairs than the item was worth', () => {
    const wrecked = pay(
      {
        cosmetic: 'broken',
        functions: {
          screen_damage: 'fault',
          keyboard_fault: 'fault',
          charging_fault: 'fault',
          network_fault: 'fault',
          cooling_fault: 'fault',
          speed_fault: 'fault',
          camera_audio_fault: 'fault',
          hinge_fault: 'fault',
          liquid_fault: 'fault',
        },
      },
      {},
      { originalPriceCents: 60000, ageMonths: 40 }
    );
    expect(wrecked.repairsTotalCents).toBeLessThanOrEqual(wrecked.fullValueTotalCents);
  });
});

describe('the formula shown to the customer', () => {
  const r = pay(broken('screen_damage'));
  it('adds up to exactly what is charged', () => {
    expect(r.earlyReturnTotalCents + r.customerRepairTotalCents + r.unpaidCents).toBe(
      r.returnTotalCents
    );
  });
  it('explains the worth with the factors the real valuation uses', () => {
    const shown =
      r.originalTotalCents *
        (r.factors.agePercent / 100) *
        (r.factors.conditionPercent / 100) *
        (r.factors.usagePercent / 100) -
      r.standardWorkTotalCents;
    expect(Math.abs(shown - r.worthTotalCents)).toBeLessThan(100);
  });
  it('explains what is owed, to within rounding', () => {
    const shown =
      r.paymentsLeft * r.monthlyTotalCents + r.endPriceTotalCents - r.interestSavedCents;
    expect(Math.abs(shown - r.owedTotalCents)).toBeLessThan(100);
  });
  it('matches the real amount at the actual month, including unpaid rent', () => {
    const now = returnPreviewAtMonth(context, { ...clean, ...broken('screen_damage') }, 40, 6);
    expect(now.returnTotalCents).toBe(r.returnTotalCents);
    expect(now.unpaidCents).toBe(1000);
  });
});

describe('battery', () => {
  const battery = (health: number, ageMonths: number) =>
    pay({ batteryKnown: true, batteryHealth: health }, {}, { ageMonths }).lines.map(
      (line) => line.id
    );
  it('charges 70 % after two months, but not after two years', () => {
    expect(battery(70, 2)).toEqual(['battery_weak']);
    expect(battery(70, 24)).toEqual([]);
  });
  it('never charges a battery that does not need replacing', () => {
    expect(battery(85, 2)).toEqual([]);
  });
});

describe('assessmentPreview', () => {
  const findings = {
    condition: 'fair' as const,
    targetCondition: 'good' as const,
    usageValue: 40,
    additionalRepairCents: 40000,
    damageNetCents: 40000,
  };
  it('shows the customer amount and a suggested price', () => {
    const result = assessmentPreview(context, findings);
    expect(result?.customerPaysCents).toBeGreaterThan(0);
    expect(result?.suggestedPriceNetCents).toBeGreaterThan(0);
    expect(result?.refurbishmentNetCents).toBeGreaterThanOrEqual(40000);
  });
  it('returns nothing until the inputs make sense', () => {
    expect(assessmentPreview(context, { ...findings, usageValue: Number.NaN })).toBeNull();
  });
});

it.each(['new', 'like_new'] as const)(
  'preserves an undamaged %s item as like new in the return preview',
  (baselineCondition) => {
    const result = returnPreview(
      {
        ...context,
        baselineCondition,
        finance: { ...context.finance, remainingMonths: 0, outstandingCents: 0 },
      },
      { ...clean, batteryKnown: true, batteryHealth: 95 },
      150
    );
    expect(result).toMatchObject({
      condition: 'like_new',
      issues: [],
      damageNetCents: 0,
      returnTotalCents: 0,
    });
  }
);
