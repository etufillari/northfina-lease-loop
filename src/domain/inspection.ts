import type { AssetCategory, AssetCondition } from '@/data/schemas';

/**
 * What a professional records when assessing a returned item, and the rules that follow from it.
 *
 * The fields come from real inspection practice; RECOVERY.md lists the source of each one.
 * The result scale follows dealer checklists ("meets standard / adjust or repair / not applicable"),
 * extended with "wear" because lease returns must separate ordinary wear from damage.
 */
export const checkResults = ['pass', 'wear', 'repair', 'not_applicable', 'not_tested'] as const;
export type CheckResult = (typeof checkResults)[number];

/** How much a failed check says about the item, which limits the condition it can be graded. */
export type CheckGate = 'identity' | 'structural' | 'safety' | 'function' | 'condition';
export type CheckDefinition = { id: string; gate: CheckGate };

export const readingUnits = ['percent', 'mm', 'count', 'hours', 'bar'] as const;
export type ReadingUnit = (typeof readingUnits)[number];
export type ReadingDefinition = { id: string; unit: ReadingUnit; max: number };

export const usageSources = ['display', 'diagnostic_tool', 'service_record', 'customer'] as const;
export type UsageSource = (typeof usageSources)[number];
export const damageTypes = ['scratch', 'dent', 'crack', 'missing_part', 'liquid', 'other'] as const;
export type DamageType = (typeof damageTypes)[number];
export const damageLiabilities = ['existing', 'fair_wear', 'chargeable'] as const;
export type DamageLiability = (typeof damageLiabilities)[number];

export type InspectionCheck = {
  id: string;
  result: CheckResult;
  repairCents: number;
  note: string;
  /** Whether this repair is new damage the customer answers for. Defaults to yes. */
  chargeable?: boolean;
};
export type InspectionReading = { id: string; value: number | null };
export type DamageEntry = {
  area: string;
  type: DamageType;
  liability: DamageLiability;
  repairCents: number;
};
export type InspectionRecord = {
  /** Only on older records: a professional's own reading needs no provenance. */
  usageSource?: UsageSource;
  customerPresent: boolean;
  checks: InspectionCheck[];
  readings: InspectionReading[];
  damage: DamageEntry[];
};

const commonChecks: readonly CheckDefinition[] = [
  { id: 'serial_match', gate: 'identity' },
  { id: 'accessories_complete', gate: 'condition' },
  { id: 'service_records', gate: 'condition' },
];

const categoryChecks: Record<AssetCategory, readonly CheckDefinition[]> = {
  e_bike: [
    { id: 'frame_fork', gate: 'structural' },
    { id: 'brakes', gate: 'safety' },
    { id: 'battery_pack', gate: 'safety' },
    { id: 'wheels', gate: 'safety' },
    { id: 'tyres', gate: 'function' },
    { id: 'drivetrain', gate: 'function' },
    { id: 'motor_assist', gate: 'function' },
    { id: 'display_controls', gate: 'function' },
    { id: 'charging', gate: 'function' },
  ],
  laptop: [
    // A laptop hinge is a repairable fault, as in the customer's report, not a damaged structure.
    { id: 'chassis_hinges', gate: 'function' },
    { id: 'battery_pack', gate: 'safety' },
    { id: 'power_on', gate: 'function' },
    { id: 'display', gate: 'function' },
    { id: 'keyboard', gate: 'function' },
    { id: 'trackpad', gate: 'function' },
    { id: 'cooling', gate: 'function' },
    { id: 'ports', gate: 'function' },
    { id: 'wireless', gate: 'function' },
    { id: 'camera_audio', gate: 'function' },
    { id: 'charging', gate: 'function' },
    { id: 'storage', gate: 'function' },
  ],
  farm_machine: [
    { id: 'chassis_hitch', gate: 'structural' },
    { id: 'rops_seatbelt', gate: 'safety' },
    { id: 'pto_guard', gate: 'safety' },
    { id: 'brakes_steering', gate: 'safety' },
    { id: 'engine', gate: 'function' },
    { id: 'fluids', gate: 'function' },
    { id: 'hydraulics', gate: 'function' },
    { id: 'transmission_clutch', gate: 'function' },
    { id: 'pto_operation', gate: 'function' },
    { id: 'tyres', gate: 'function' },
    { id: 'electrics_lights', gate: 'function' },
  ],
};

const categoryReadings: Record<AssetCategory, readonly ReadingDefinition[]> = {
  e_bike: [
    { id: 'battery_health', unit: 'percent', max: 100 },
    { id: 'charge_cycles', unit: 'count', max: 100_000 },
    { id: 'brake_pad', unit: 'mm', max: 50 },
  ],
  laptop: [
    { id: 'battery_health', unit: 'percent', max: 100 },
    { id: 'storage_health', unit: 'percent', max: 100 },
    { id: 'dead_pixels', unit: 'count', max: 100_000 },
  ],
  farm_machine: [
    { id: 'tyre_tread', unit: 'mm', max: 200 },
    { id: 'last_service_hours', unit: 'hours', max: 1_000_000 },
    { id: 'hydraulic_pressure', unit: 'bar', max: 1_000 },
  ],
};

export function inspectionChecks(category: AssetCategory): readonly CheckDefinition[] {
  // A laptop has no service book, so asking for one only creates noise.
  const common =
    category === 'laptop'
      ? commonChecks.filter((check) => check.id !== 'service_records')
      : commonChecks;
  return [...common, ...categoryChecks[category]];
}

export function inspectionReadings(category: AssetCategory): readonly ReadingDefinition[] {
  return categoryReadings[category];
}

/** The customer's reported issues, mapped onto the checks where staff should look first. */
const issueChecks: Record<string, readonly string[]> = {
  missing_accessories: ['accessories_complete'],
  not_working: ['power_on', 'motor_assist', 'engine'],
  screen_damage: ['display'],
  cooling_fault: ['cooling'],
  speed_fault: ['storage', 'power_on'],
  camera_audio_fault: ['camera_audio'],
  hinge_fault: ['chassis_hinges'],
  liquid_fault: ['power_on'],
  keyboard_fault: ['keyboard'],
  network_fault: ['wireless'],
  charging_fault: ['charging'],
  battery_weak: ['battery_pack'],
  brakes_fault: ['brakes'],
  tyres_worn: ['tyres'],
  drive_fault: ['drivetrain'],
  engine_fault: ['engine'],
  hydraulic_fault: ['hydraulics'],
  service_due: ['service_records'],
};

export function reportedCheckIds(category: AssetCategory, issues: readonly string[]): string[] {
  const known = new Set(inspectionChecks(category).map((check) => check.id));
  const reported = issues.flatMap((issue) => issueChecks[issue] ?? []);
  return [...new Set(reported)].filter((id) => known.has(id));
}

/**
 * What the customer was quoted for this part, if they reported it. A check maps to the issue whose
 * first check it is, so one reported fault suggests a cost on one line and is never counted twice.
 */
export function reportedRepairCents(
  checkId: string,
  lines: readonly { id: string; netCents: number }[]
): number | null {
  return lines.find((line) => issueChecks[line.id]?.[0] === checkId)?.netCents ?? null;
}

const conditionOrder: readonly AssetCondition[] = ['poor', 'fair', 'good', 'like_new', 'new'];

export function conditionsUpTo(cap: AssetCondition): AssetCondition[] {
  return conditionOrder.slice(0, conditionOrder.indexOf(cap) + 1);
}

function lowerOf(a: AssetCondition, b: AssetCondition): AssetCondition {
  return conditionOrder.indexOf(a) < conditionOrder.indexOf(b) ? a : b;
}

const capForRepair: Record<CheckGate, AssetCondition> = {
  identity: 'poor',
  structural: 'poor',
  safety: 'fair',
  function: 'fair',
  condition: 'good',
};

/** Whole cents, non-negative: the only shape a repair amount may have. */
function validCents(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export type InspectionEvaluation = {
  /** False when the record is incomplete or contradicts itself; the quote must not be saved. */
  ok: boolean;
  missingChecks: string[];
  invalidChecks: string[];
  invalidReadings: string[];
  invalidDamage: number[];
  /** The best condition the findings allow. A used item is never graded above like new. */
  conditionCap: AssetCondition;
  /** All repair lines, net. Standard tasks such as a data wipe are priced separately. */
  repairNetCents: number;
  /** The repairs the customer is responsible for, net, before their share is applied. */
  chargeableNetCents: number;
};

/**
 * Turns findings into a grade limit and repair totals. Like an auction grade, where structural
 * damage caps the grade whatever the rest looks like, the worst finding limits the condition:
 * structure or identity → poor, safety or function → fair, any wear or logged damage → good.
 */
export function evaluateInspection(
  category: AssetCategory,
  record: InspectionRecord
): InspectionEvaluation {
  const definitions = inspectionChecks(category);
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const answered = new Map(record.checks.map((check) => [check.id, check]));
  const missingChecks = definitions.map(({ id }) => id).filter((id) => !answered.has(id));
  const invalidChecks: string[] = [];
  let conditionCap: AssetCondition = 'like_new';
  let repairNetCents = 0;
  let chargeableNetCents = 0;
  const seen = new Set<string>();

  for (const check of record.checks) {
    const definition = byId.get(check.id);
    const repeated = seen.has(check.id);
    seen.add(check.id);
    if (
      !definition ||
      repeated ||
      !validCents(check.repairCents) ||
      // Only a repair finding can carry a repair cost.
      (check.repairCents > 0 && check.result !== 'repair') ||
      // An item's identity can always be checked and cannot "wear".
      (definition.gate === 'identity' && ['wear', 'not_applicable'].includes(check.result))
    ) {
      invalidChecks.push(check.id);
      continue;
    }
    repairNetCents += check.repairCents;
    if (check.chargeable !== false) chargeableNetCents += check.repairCents;
    if (check.result === 'wear') conditionCap = lowerOf(conditionCap, 'good');
    if (check.result === 'repair')
      conditionCap = lowerOf(conditionCap, capForRepair[definition.gate]);
  }

  const readings = new Map(inspectionReadings(category).map((reading) => [reading.id, reading]));
  const invalidReadings = record.readings
    .filter((reading) => {
      const definition = readings.get(reading.id);
      if (!definition) return true;
      return (
        reading.value !== null &&
        (!Number.isFinite(reading.value) || reading.value < 0 || reading.value > definition.max)
      );
    })
    .map((reading) => reading.id);

  const invalidDamage: number[] = [];
  record.damage.forEach((entry, index) => {
    if (!entry.area.trim() || !validCents(entry.repairCents)) {
      invalidDamage.push(index);
      return;
    }
    repairNetCents += entry.repairCents;
    if (entry.liability === 'chargeable') chargeableNetCents += entry.repairCents;
    conditionCap = lowerOf(conditionCap, 'good');
  });

  return {
    ok:
      !missingChecks.length &&
      !invalidChecks.length &&
      !invalidReadings.length &&
      !invalidDamage.length,
    missingChecks,
    invalidChecks,
    invalidReadings,
    invalidDamage,
    conditionCap,
    repairNetCents,
    chargeableNetCents,
  };
}

/** A battery with its own repair cost replaces the usage-based task, so it is not paid for twice. */
export function batteryIsRepairLine(record: InspectionRecord | undefined): boolean {
  return Boolean(
    record?.checks.some(
      (check) => check.id === 'battery_pack' && check.result === 'repair' && check.repairCents > 0
    )
  );
}
