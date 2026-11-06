import type { AssetCondition } from '@/data/schemas';
import type { InspectionRecord } from './inspection';

/** One change made to an item before relisting. Never holds an inspector's free-text notes. */
export type ItemChange =
  | { kind: 'part'; checkId: string; action: 'repaired' | 'replaced' | 'updated' }
  | { kind: 'damage'; area: string; type: string }
  | { kind: 'condition'; from: AssetCondition; to: AssetCondition }
  | { kind: 'task'; id: string };

const partActions: Record<string, 'replaced' | 'updated'> = {
  battery_pack: 'replaced',
  accessories_complete: 'replaced',
  service_records: 'updated',
};

function batteryReplaced(
  workItems: readonly { id: string }[],
  record: InspectionRecord | undefined
) {
  return (
    workItems.some((item) => item.id === 'battery_replacement') ||
    Boolean(
      record?.checks.some((check) => check.id === 'battery_pack' && check.result === 'repair')
    )
  );
}

/**
 * What changed, as a buyer would read it: the parts, the damage put right, the one step in
 * condition however many grades it took, then the standard tasks. A serial number mismatch is
 * not work done to the item, and the "additional repairs" total only stands in when no itemized
 * record exists to name them.
 */
export function itemChanges(input: {
  condition: AssetCondition;
  targetCondition: AssetCondition;
  workItems: readonly { id: string; reason: string }[];
  record: InspectionRecord | undefined;
}): ItemChange[] {
  const { condition, targetCondition, workItems, record } = input;
  const parts: ItemChange[] = (record?.checks ?? [])
    .filter((check) => check.result === 'repair' && check.id !== 'serial_match')
    .map((check) => ({
      kind: 'part',
      checkId: check.id,
      action: partActions[check.id] ?? 'repaired',
    }));
  const damage: ItemChange[] = (record?.damage ?? [])
    .filter((entry) => entry.repairCents > 0)
    .map((entry) => ({ kind: 'damage', area: entry.area, type: entry.type }));
  const upgraded = workItems.some((item) => item.reason === 'condition_upgrade');
  const batteryListed = parts.some(
    (part) => part.kind === 'part' && part.checkId === 'battery_pack'
  );
  const tasks: ItemChange[] = workItems
    .filter(
      (item) =>
        item.reason !== 'condition_upgrade' &&
        !(record && item.id === 'additional_repair') &&
        !(batteryListed && item.id === 'battery_replacement')
    )
    .map((item) => ({ kind: 'task', id: item.id }));
  return [
    ...parts,
    ...damage,
    ...(upgraded ? [{ kind: 'condition' as const, from: condition, to: targetCondition }] : []),
    ...tasks,
  ];
}

/**
 * The battery as it leaves refurbishment: new if it was replaced, otherwise what the inspector
 * measured. Null when neither is known, because cycles alone do not tell us its health.
 */
export function batteryAfterWork(
  workItems: readonly { id: string }[],
  record: InspectionRecord | undefined
): { kind: 'new' } | { kind: 'measured'; percent: number } | null {
  if (batteryReplaced(workItems, record)) return { kind: 'new' };
  const percent = record?.readings.find((reading) => reading.id === 'battery_health')?.value;
  return typeof percent === 'number' ? { kind: 'measured', percent } : null;
}
