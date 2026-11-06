import type { AssetCategory, AssetCondition, RefurbishmentCosts } from '@/data/schemas';
import { batteryAssessment, laptopAnswerParts, laptopPartCost } from './laptop-parts';

/** 'minor' still works but needs some attention; 'fault' means it does not do its job. */
export type CheckAnswer = 'working' | 'minor' | 'fault' | 'unknown';
export type ConditionAnswers = {
  power: CheckAnswer;
  batteryKnown: boolean;
  batteryHealth: number | null;
  functions: Record<string, CheckAnswer>;
  cosmetic: 'same' | 'light' | 'deep' | 'broken';
  accessories: 'complete' | 'missing' | 'unknown';
};
export const categoryChecks: Record<AssetCategory, readonly string[]> = {
  laptop: [
    'screen_damage',
    'keyboard_fault',
    'charging_fault',
    'network_fault',
    'cooling_fault',
    'speed_fault',
    'camera_audio_fault',
    'hinge_fault',
    'liquid_fault',
  ],
  e_bike: ['brakes_fault', 'tyres_worn', 'drive_fault'],
  farm_machine: ['engine_fault', 'hydraulic_fault', 'service_due'],
};
const returnGrades = [
  'poor',
  'fair',
  'good',
  'like_new',
] as const satisfies readonly AssetCondition[];
const grades: readonly AssetCondition[] = [...returnGrades, 'new'];

/**
 * Demo estimates of a typical repair, in basis points of the item's original price, so they scale
 * from a mower to a tractor. They give the customer an honest early figure; staff replace them with
 * real repair lines at inspection. Each part counts separately, so every answer moves the amount.
 */
const repairEstimates: Record<
  Exclude<AssetCategory, 'laptop'>,
  Record<string, { minor: number; fault: number }>
> = {
  e_bike: {
    power: { minor: 300, fault: 2000 },
    brakes_fault: { minor: 100, fault: 300 },
    tyres_worn: { minor: 100, fault: 300 },
    drive_fault: { minor: 500, fault: 2000 },
  },
  farm_machine: {
    power: { minor: 200, fault: 1500 },
    engine_fault: { minor: 500, fault: 2000 },
    hydraulic_fault: { minor: 200, fault: 800 },
    service_due: { minor: 100, fault: 300 },
  },
};

export type RepairLine = { id: string; netCents: number };

/** The answers a part offers. Liquid damage either happened or it did not. */
export function answerOptions(key: string): readonly CheckAnswer[] {
  return key === 'liquid_fault'
    ? ['working', 'fault', 'unknown']
    : ['working', 'minor', 'fault', 'unknown'];
}

/**
 * The repairs the customer's answers lead to, net. Unknown costs nothing yet. Laptops use real part
 * costs; other categories still use a share of the price. Rounded once, half up.
 */
export function repairLines(
  category: AssetCategory,
  originalPriceCents: number,
  answers: Pick<ConditionAnswers, 'power' | 'functions' | 'batteryKnown' | 'batteryHealth'>,
  ageMonths: number,
  costs: RefurbishmentCosts
): RepairLine[] {
  if (!Number.isSafeInteger(originalPriceCents) || originalPriceCents < 0)
    throw new RangeError('Invalid original price');
  if (category === 'laptop') {
    const lines: RepairLine[] = [];
    for (const [id, parts] of Object.entries(laptopAnswerParts)) {
      const answer = answers.functions[id];
      const part = answer === 'minor' ? parts.minor : answer === 'fault' ? parts.fault : undefined;
      if (part) lines.push({ id, netCents: laptopPartCost(part, originalPriceCents) });
    }
    const battery = costs.laptop?.fixed.find((task) => task.id === 'battery_replacement');
    if (
      battery &&
      answers.batteryKnown &&
      answers.batteryHealth !== null &&
      batteryAssessment(answers.batteryHealth, ageMonths).customerPays
    )
      lines.push({ id: 'battery_weak', netCents: battery.cost_cents });
    return lines;
  }
  const reported: Record<string, CheckAnswer> = { ...answers.functions, power: answers.power };
  return Object.entries(repairEstimates[category]).flatMap(([id, cost]) => {
    const answer = reported[id];
    const basisPoints = answer === 'minor' ? cost.minor : answer === 'fault' ? cost.fault : 0;
    return basisPoints
      ? [
          {
            id,
            netCents: Number((BigInt(originalPriceCents) * BigInt(basisPoints) + 5000n) / 10000n),
          },
        ]
      : [];
  });
}

/** Normal use may move a new/like-new item to good; previous damage is never charged again. */
export function conditionDamageCost(
  baseline: AssetCondition,
  returned: AssetCondition,
  costs: RefurbishmentCosts[AssetCategory]
) {
  const target = Math.min(grades.indexOf(baseline), grades.indexOf('good'));
  const start = grades.indexOf(returned);
  if (target < 0 || start < 0) throw new RangeError('Invalid condition');
  let amount = 0;
  for (let index = start; index < target; index++) {
    const cost = costs.condition_upgrades[`${grades[index]}->${grades[index + 1]}`];
    if (!Number.isSafeInteger(cost) || cost! < 0) throw new RangeError('Missing repair cost');
    amount += cost!;
  }
  return amount;
}

/** Convert observable answers into a provisional report; unknowns require inspection, not a made-up repair fee. */
export function conditionReport(
  category: AssetCategory,
  baseline: AssetCondition,
  answers: ConditionAnswers,
  costs: RefurbishmentCosts
) {
  if (
    answers.batteryKnown &&
    (!Number.isInteger(answers.batteryHealth) ||
      answers.batteryHealth! < 0 ||
      answers.batteryHealth! > 100)
  )
    throw new RangeError('Invalid battery health');
  if (
    categoryChecks[category].some(
      (key) => !['working', 'minor', 'fault', 'unknown'].includes(answers.functions[key] ?? '')
    )
  )
    throw new RangeError('Incomplete functional checks');
  // A returned item can be like new, but cannot be reported as new.
  const baselineIndex = Math.min(grades.indexOf(baseline), returnGrades.length - 1);
  const cosmeticIndex =
    answers.cosmetic === 'broken'
      ? 0
      : answers.cosmetic === 'deep'
        ? 1
        : answers.cosmetic === 'light'
          ? 2
          : baselineIndex;
  const cosmeticCondition = returnGrades[Math.min(baselineIndex, cosmeticIndex)]!;
  const answered = Object.values(answers.functions);
  const faults = categoryChecks[category].filter((key) =>
    ['minor', 'fault'].includes(answers.functions[key] ?? '')
  );
  const issues = [...faults];
  if (answers.power === 'fault') issues.push('not_working');
  if (answers.cosmetic === 'light') issues.push('cosmetic_scratches');
  if (answers.cosmetic === 'deep' || answers.cosmetic === 'broken') issues.push('dents');
  if (answers.accessories === 'missing') issues.push('missing_accessories');
  if (answers.batteryKnown && answers.batteryHealth! < 80) issues.push('battery_weak');
  // Something that does not work can be fair at best, and a partial problem good at best. Only
  // visible breakage reaches poor, so one fault no longer decides the whole item's grade.
  const cap =
    answers.power === 'fault' || answered.includes('fault')
      ? grades.indexOf('fair')
      : answers.power === 'minor' || answered.includes('minor')
        ? grades.indexOf('good')
        : grades.indexOf('like_new');
  return {
    condition: returnGrades[Math.min(returnGrades.indexOf(cosmeticCondition), cap)]!,
    cosmeticCondition,
    issues: [...new Set(issues)],
    damageNetCents: conditionDamageCost(baseline, cosmeticCondition, costs[category]),
    inspectionRequired:
      answers.cosmetic === 'deep' ||
      answers.cosmetic === 'broken' ||
      (category !== 'laptop' && answers.power !== 'working') ||
      faults.length > 0 ||
      answered.includes('unknown') ||
      answers.accessories !== 'complete' ||
      (category !== 'farm_machine' && !answers.batteryKnown),
    policyVersion: 'condition-v3',
  };
}
