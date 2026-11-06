// Standard repairs to pick from when refurbishing a returned item, on top of the jobs the data
// pack requires (refurbishment-costs.json: condition upgrades, batteries, safety checks, data
// wipes, services). The data pack has no prices for everyday repairs, so these are OUR OWN
// standard prices (fictional, net cents), one list per kind of item. Anything else can be added
// as a custom line with its own price.
import type { AssetCategory } from '@/data/schemas';

export type RepairPreset = { id: string; costCents: number };

export const REPAIR_PRESETS: Record<AssetCategory, readonly RepairPreset[]> = {
  e_bike: [
    { id: 'tyres', costCents: 6_000 },
    { id: 'brakes', costCents: 4_000 },
    { id: 'chain_cassette', costCents: 7_500 },
    { id: 'lights', costCents: 3_000 },
    { id: 'display', costCents: 9_000 },
    { id: 'paint_touch_up', costCents: 5_000 },
  ],
  laptop: [
    { id: 'screen_glass', costCents: 18_000 },
    { id: 'keyboard', costCents: 9_000 },
    { id: 'trackpad', costCents: 7_000 },
    { id: 'hinge', costCents: 6_000 },
    { id: 'charger', costCents: 4_500 },
    { id: 'deep_clean', costCents: 2_500 },
  ],
  farm_machine: [
    { id: 'tyres', costCents: 250_000 },
    { id: 'hydraulics', costCents: 180_000 },
    { id: 'cabin_glass', costCents: 90_000 },
    { id: 'rust_paint', costCents: 120_000 },
    { id: 'electrics', costCents: 80_000 },
  ],
};

/** One repair that was done: a preset (priced from the list above) or a custom line. */
export type RepairLine = { presetId: string | null; label: string | null; costCents: number };

export type CustomRepair = { label: string; costCents: number };

export const MAX_REPAIR_LINES = 20;
export const MAX_REPAIR_CENTS = 10_000_000;

export type RepairLinesResult =
  | { ok: true; lines: RepairLine[]; costCents: number }
  | { ok: false; reason: 'unknown_preset' | 'invalid_custom' | 'too_many' };

/**
 * The repairs for an item of `category`: chosen presets (at their standard price, so a request
 * can't change them) and custom lines (a name of 1–80 characters and a whole-cent price up to
 * €100,000). Duplicate presets count once.
 */
export function repairLines(
  category: AssetCategory,
  presetIds: readonly string[],
  custom: readonly CustomRepair[]
): RepairLinesResult {
  const unique = [...new Set(presetIds)];
  if (unique.length + custom.length > MAX_REPAIR_LINES) return { ok: false, reason: 'too_many' };
  const lines: RepairLine[] = [];
  for (const id of unique) {
    const preset = REPAIR_PRESETS[category].find((p) => p.id === id);
    if (!preset) return { ok: false, reason: 'unknown_preset' };
    lines.push({ presetId: preset.id, label: null, costCents: preset.costCents });
  }
  for (const line of custom) {
    const label = line.label.trim();
    if (
      label.length === 0 ||
      label.length > 80 ||
      !Number.isInteger(line.costCents) ||
      line.costCents < 0 ||
      line.costCents > MAX_REPAIR_CENTS
    ) {
      return { ok: false, reason: 'invalid_custom' };
    }
    lines.push({ presetId: null, label, costCents: line.costCents });
  }
  return { ok: true, lines, costCents: lines.reduce((sum, line) => sum + line.costCents, 0) };
}
