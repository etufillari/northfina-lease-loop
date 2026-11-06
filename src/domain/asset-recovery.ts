import type {
  AssetCategory,
  AssetCondition,
  RefurbishmentCosts,
  ResidualCurves,
} from '@/data/schemas';

export type RecoveryInput = {
  category: AssetCategory;
  originalPriceCents: number;
  ageMonths: number;
  condition: AssetCondition;
  targetCondition: AssetCondition;
  usageValue: number;
  maintenanceUsageValue: number;
  additionalRepairCents: number;
  /** The battery is already a separate repair line, so the usage rule must not add it again. */
  skipBatteryTask?: boolean;
};

export type RecoveryWorkItem = {
  id: string;
  costCents: number;
  reason:
    'condition_upgrade' | 'required_before_lease' | 'maintenance_threshold' | 'professional_quote';
};

const scale = 1_000_000n;
const conditionOrder: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

function monthDays(year: number, month: number) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function dateParts(date: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Invalid recovery date');
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day || year > 9999 || month > 12 || day > monthDays(year, month)) {
    throw new RangeError('Invalid recovery date');
  }
  return [year, month, day];
}

/** Establish a legacy item's documented age baseline; never re-establish it for a new lease. */
export function recoveryFirstUseDate(today: string, ageMonths: number): string {
  const [year, month, day] = dateParts(today);
  if (!Number.isSafeInteger(ageMonths) || ageMonths < 0)
    throw new RangeError('Invalid recovery age');
  const absoluteMonth = year * 12 + month - 1 - ageMonths;
  const firstYear = Math.floor(absoluteMonth / 12);
  if (firstYear < 1) throw new RangeError('Recovery age exceeds calendar range');
  const firstMonth = (absoluteMonth % 12) + 1;
  return `${String(firstYear).padStart(4, '0')}-${String(firstMonth).padStart(2, '0')}-${String(Math.min(day, monthDays(firstYear, firstMonth))).padStart(2, '0')}`;
}

/** Whole elapsed calendar months, using the original day clamped to shorter months. */
export function recoveryAgeMonths(firstUseDate: string, today: string): number {
  const [firstYear, firstMonth, firstDay] = dateParts(firstUseDate);
  const [year, month, day] = dateParts(today);
  if (firstUseDate > today) throw new RangeError('First use cannot be in the future');
  const months = (year - firstYear) * 12 + month - firstMonth;
  return Math.max(0, months - (day < Math.min(firstDay, monthDays(year, month)) ? 1 : 0));
}

function scaledRatio(value: number) {
  const scaled = Math.round(value * Number(scale));
  if (!Number.isSafeInteger(scaled) || Math.abs(scaled / Number(scale) - value) > 1e-10) {
    throw new RangeError('Recovery ratios require at most six decimal places');
  }
  return BigInt(scaled);
}

function wholeCents(numerator: bigint, denominator: bigint): number {
  const value = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Recovery amount exceeds safe cents');
  return value;
}

function valueAtCondition(input: RecoveryInput, condition: AssetCondition, curves: ResidualCurves) {
  const points = curves.curves[input.category];
  if (
    !points?.length ||
    points.some(
      ([age, percent], index) =>
        !Number.isSafeInteger(age) ||
        age < 0 ||
        percent < 0 ||
        percent > 100 ||
        (index > 0 && points[index - 1]![0] >= age)
    )
  )
    throw new RangeError('Invalid age curve');
  let left = points[0]!;
  let right = left;
  for (const point of points) {
    if (point[0] <= input.ageMonths) left = point;
    right = point;
    if (point[0] >= input.ageMonths) break;
  }
  const interval = right[0] === left[0] ? 1n : BigInt(right[0] - left[0]);
  const ageOffset = BigInt(Math.max(0, input.ageMonths - left[0]));
  const leftRatio = scaledRatio(left[1] / 100);
  const ageNumerator = leftRatio * interval + (scaledRatio(right[1] / 100) - leftRatio) * ageOffset;
  const adjustment = curves.usage_adjustment[input.category];
  if (
    !adjustment ||
    !Number.isFinite(adjustment.step) ||
    adjustment.step <= 0 ||
    !Number.isFinite(adjustment.percent_per_step) ||
    adjustment.percent_per_step > 0 ||
    !Number.isFinite(adjustment.max_total_percent) ||
    adjustment.max_total_percent > 0 ||
    adjustment.max_total_percent < -100
  ) {
    throw new RangeError('Invalid usage adjustment');
  }
  const steps = Math.floor(input.usageValue / adjustment.step);
  const usagePercent = Math.max(adjustment.max_total_percent, steps * adjustment.percent_per_step);
  const conditionMultiplier = curves.condition_multiplier[condition];
  if (!Number.isFinite(conditionMultiplier) || conditionMultiplier < 0)
    throw new RangeError('Invalid condition multiplier');
  // Preserve exact interpolated fractions; round only the final valuation, half up, to a cent.
  return wholeCents(
    BigInt(input.originalPriceCents) *
      ageNumerator *
      scaledRatio(conditionMultiplier) *
      scaledRatio(1 + usagePercent / 100),
    interval * scale * scale * scale
  );
}

/** Value a physical item and price its required work; replacing a component never erases lifetime usage. */
export function assetRecovery(
  input: RecoveryInput,
  curves: ResidualCurves,
  costs: RefurbishmentCosts
) {
  if (
    ![
      input.originalPriceCents,
      input.ageMonths,
      input.usageValue,
      input.maintenanceUsageValue,
      input.additionalRepairCents,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    input.maintenanceUsageValue > input.usageValue
  ) {
    throw new RangeError('Invalid recovery facts');
  }
  const start = conditionOrder.indexOf(input.condition);
  const target = conditionOrder.indexOf(input.targetCondition);
  if (
    start < 0 ||
    target < Math.max(start, conditionOrder.indexOf('good')) ||
    (input.targetCondition === 'new' && input.condition !== 'new')
  ) {
    throw new RangeError(
      'A public second-life item must reach good condition without being labelled new'
    );
  }
  const categoryCosts = costs[input.category];
  if (!categoryCosts) throw new RangeError('Missing refurbishment costs');
  const workItems: RecoveryWorkItem[] = [];
  for (let index = start; index < target; index++) {
    const id = `${conditionOrder[index]}->${conditionOrder[index + 1]}`;
    const costCents = categoryCosts.condition_upgrades[id];
    if (!Number.isSafeInteger(costCents) || costCents! < 0)
      throw new RangeError('Missing condition upgrade cost');
    workItems.push({ id, costCents: costCents!, reason: 'condition_upgrade' });
  }
  const maintenanceUsage = input.usageValue - input.maintenanceUsageValue;
  for (const task of categoryCosts.fixed) {
    if (!Number.isSafeInteger(task.cost_cents) || task.cost_cents < 0)
      throw new RangeError('Invalid task cost');
    let count: number;
    let reason: RecoveryWorkItem['reason'] = 'maintenance_threshold';
    switch (task.id) {
      case 'safety_inspection':
      case 'certified_data_wipe':
        count = 1;
        reason = 'required_before_lease';
        break;
      case 'battery_replacement':
        if (input.skipBatteryTask) count = 0;
        else if (input.category === 'e_bike') count = maintenanceUsage >= 15_000 ? 1 : 0;
        else if (input.category === 'laptop') count = maintenanceUsage >= 500 ? 1 : 0;
        else throw new RangeError('Unsupported battery service category');
        break;
      case 'major_service':
        if (input.category !== 'farm_machine')
          throw new RangeError('Unsupported major service category');
        count = Math.ceil(maintenanceUsage / 1000);
        break;
      default:
        throw new RangeError('Unsupported refurbishment task');
    }
    if (count) {
      const costCents = task.cost_cents * count;
      if (!Number.isSafeInteger(costCents)) throw new RangeError('Task cost exceeds safe cents');
      workItems.push({ id: task.id, costCents, reason });
    }
  }
  if (input.additionalRepairCents)
    workItems.push({
      id: 'additional_repair',
      costCents: input.additionalRepairCents,
      reason: 'professional_quote',
    });
  const refurbishmentCostCents = workItems.reduce((sum, item) => sum + item.costCents, 0);
  if (!Number.isSafeInteger(refurbishmentCostCents))
    throw new RangeError('Refurbishment cost exceeds safe cents');
  const asReturnedValueCents = valueAtCondition(input, input.condition, curves);
  const postRepairValueCents = valueAtCondition(input, input.targetCondition, curves);
  return {
    asReturnedValueCents,
    postRepairValueCents,
    refurbishmentCostCents,
    netRecoveryCents: Math.max(0, postRepairValueCents - refurbishmentCostCents),
    valueUpliftCents: postRepairValueCents - asReturnedValueCents,
    workItems,
    policyVersion: 'recovery-v1' as const,
  };
}

/** What the item is worth to us after the work every return needs, before any repairs for damage. */
export function valueAfterStandardWork(recovery: {
  postRepairValueCents: number;
  workItems: readonly RecoveryWorkItem[];
}): number {
  const standard = recovery.workItems
    .filter(
      (item) => item.reason === 'required_before_lease' || item.reason === 'maintenance_threshold'
    )
    .reduce((sum, item) => sum + item.costCents, 0);
  return Math.max(0, recovery.postRepairValueCents - standard);
}

/**
 * The factors behind a valuation, for showing the formula to people. Display only: these are
 * rounded-friendly percentages, and the money always comes from the exact calculation above.
 */
export function valuationFactors(
  input: Pick<RecoveryInput, 'category' | 'ageMonths' | 'usageValue'> & {
    condition: AssetCondition;
  },
  curves: ResidualCurves
) {
  const points = curves.curves[input.category] ?? [];
  let agePercent = points.at(-1)?.[1] ?? 0;
  for (let index = 0; index < points.length; index++) {
    const [age, percent] = points[index]!;
    if (input.ageMonths > age) continue;
    const previous = points[index - 1];
    agePercent = previous
      ? previous[1] +
        ((percent - previous[1]) * (input.ageMonths - previous[0])) / (age - previous[0])
      : percent;
    break;
  }
  const adjustment = curves.usage_adjustment[input.category];
  const usageChange = adjustment
    ? Math.max(
        adjustment.max_total_percent,
        Math.floor(input.usageValue / adjustment.step) * adjustment.percent_per_step
      )
    : 0;
  return {
    agePercent,
    conditionPercent: (curves.condition_multiplier[input.condition] ?? 0) * 100,
    usagePercent: 100 + usageChange,
  };
}
