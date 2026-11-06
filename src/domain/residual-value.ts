import type { AssetCategory, AssetCondition, ResidualCurves, UsageUnit } from '../data/schemas';

export type ResidualValueInput = {
  category: AssetCategory;
  originalPriceCents: number;
  modelYear: number;
  valuationDate: string;
  condition: AssetCondition;
  usage: {
    unit: UsageUnit;
    value: number;
  };
  curves: ResidualCurves;
};

export type ResidualValueResult =
  | {
      ok: true;
      marketValueCents: number;
      ageMonths: number;
      ageMultiplier: number;
      conditionMultiplier: number;
      usageMultiplier: number;
    }
  | {
      ok: false;
      reason:
        | 'invalid_date'
        | 'invalid_input'
        | 'missing_curve'
        | 'missing_condition_multiplier'
        | 'missing_usage_adjustment'
        | 'usage_unit_mismatch';
    };

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return days[month - 1] ?? 0;
}

function calculateAgeMonths(modelYear: number, valuationDate: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valuationDate);

  if (!dateMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  if (!Number.isInteger(modelYear) || modelYear < 1 || year < modelYear) {
    return null;
  }

  return (year - modelYear) * 12 + (month - 1);
}

function interpolateAgeMultiplier(points: [number, number][], ageMonths: number): number | null {
  if (points.length === 0) {
    return null;
  }

  const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);

  for (let index = 0; index < sortedPoints.length; index += 1) {
    const currentPoint = sortedPoints[index];

    if (!currentPoint) {
      return null;
    }

    const [month, percentage] = currentPoint;

    if (!Number.isFinite(month) || !Number.isFinite(percentage) || month < 0) {
      return null;
    }

    if (index > 0) {
      const previousPoint = sortedPoints[index - 1];

      if (!previousPoint || month <= previousPoint[0]) {
        return null;
      }
    }
  }

  const firstPoint = sortedPoints[0];
  const lastPoint = sortedPoints[sortedPoints.length - 1];

  if (!firstPoint || !lastPoint) {
    return null;
  }

  if (ageMonths <= firstPoint[0]) {
    return firstPoint[1] / 100;
  }

  if (ageMonths >= lastPoint[0]) {
    return lastPoint[1] / 100;
  }

  for (let index = 0; index < sortedPoints.length - 1; index += 1) {
    const startPoint = sortedPoints[index];
    const endPoint = sortedPoints[index + 1];

    if (!startPoint || !endPoint) {
      return null;
    }

    const [startMonth, startPercentage] = startPoint;
    const [endMonth, endPercentage] = endPoint;

    if (ageMonths >= startMonth && ageMonths <= endMonth) {
      const progress = (ageMonths - startMonth) / (endMonth - startMonth);

      const interpolatedPercentage = startPercentage + progress * (endPercentage - startPercentage);

      return interpolatedPercentage / 100;
    }
  }

  return null;
}

function calculateUsageMultiplier(
  usageValue: number,
  adjustment: {
    unit: UsageUnit;
    percent_per_step: number;
    step: number;
    max_total_percent: number;
  }
): number | null {
  if (
    !Number.isFinite(usageValue) ||
    usageValue < 0 ||
    !Number.isFinite(adjustment.step) ||
    adjustment.step <= 0 ||
    !Number.isFinite(adjustment.percent_per_step) ||
    !Number.isFinite(adjustment.max_total_percent)
  ) {
    return null;
  }

  const steps = Math.floor(usageValue / adjustment.step);

  const totalReduction = Math.max(
    adjustment.max_total_percent,
    steps * adjustment.percent_per_step
  );

  return Math.max(0, 1 + totalReduction / 100);
}

export function calculateResidualValue(input: ResidualValueInput): ResidualValueResult {
  const { category, originalPriceCents, modelYear, valuationDate, condition, usage, curves } =
    input;

  if (
    !Number.isSafeInteger(originalPriceCents) ||
    originalPriceCents < 0 ||
    !Number.isInteger(modelYear) ||
    modelYear < 1 ||
    !Number.isSafeInteger(usage.value) ||
    usage.value < 0
  ) {
    return { ok: false, reason: 'invalid_input' };
  }

  const ageMonths = calculateAgeMonths(modelYear, valuationDate);

  if (ageMonths === null) {
    return { ok: false, reason: 'invalid_date' };
  }

  const ageCurve = curves.curves[category];

  if (!ageCurve || ageCurve.length === 0) {
    return { ok: false, reason: 'missing_curve' };
  }

  const conditionMultiplier = curves.condition_multiplier[condition];

  if (conditionMultiplier === undefined || !Number.isFinite(conditionMultiplier)) {
    return {
      ok: false,
      reason: 'missing_condition_multiplier',
    };
  }

  const usageAdjustment = curves.usage_adjustment[category];

  if (!usageAdjustment) {
    return {
      ok: false,
      reason: 'missing_usage_adjustment',
    };
  }

  if (usage.unit !== usageAdjustment.unit) {
    return { ok: false, reason: 'usage_unit_mismatch' };
  }

  const ageMultiplier = interpolateAgeMultiplier(ageCurve, ageMonths);

  if (ageMultiplier === null) {
    return { ok: false, reason: 'missing_curve' };
  }

  const usageMultiplier = calculateUsageMultiplier(usage.value, usageAdjustment);

  if (usageMultiplier === null) {
    return { ok: false, reason: 'invalid_input' };
  }

  const marketValueCents = Math.round(
    originalPriceCents * ageMultiplier * conditionMultiplier * usageMultiplier
  );

  return {
    ok: true,
    marketValueCents,
    ageMonths,
    ageMultiplier,
    conditionMultiplier,
    usageMultiplier,
  };
}
