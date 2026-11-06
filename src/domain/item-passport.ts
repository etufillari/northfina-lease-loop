// The item passport (Smart Problem 3 bonus, scenario card 10): every life of one item and the
// CO₂ its reuse has avoided. Pure: the item, its contracts and the CO₂ factors are arguments.
import type { AssetCategory, AssetCondition, Co2Factors } from '@/data/schemas';
import { reuseEstimate } from './lease-insights';

export type PassportContract = {
  startDate: string;
  endedOn: string | null;
  status: string;
  termMonths: number;
  startCondition: string | null;
};

export type PassportLife = {
  number: number;
  /** False for lives before our records (the data pack only says how many there were). */
  recorded: boolean;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  termMonths: number | null;
  startCondition: AssetCondition | null;
  /** kg CO₂e avoided by this life reusing the item instead of making a new one. */
  co2AvoidedKg: number;
};

const conditions: readonly string[] = ['poor', 'fair', 'good', 'like_new', 'new'];
const ended = (status: string) => status === 'returned' || status === 'completed';

/**
 * Lives in order. `previousLives` counts finished lives, including any we hold a returned
 * contract for, so the ones before our records are the difference. The first life made the
 * item; every later life avoided making a new one: manufacturing CO₂ × (1 − refurbishment
 * share), discounted by the condition it started that life in (`reuseEstimate`). A life we have
 * no record of uses the item's current condition, the most cautious figure we have.
 */
export function itemPassport(
  item: { category: AssetCategory; condition: AssetCondition; previousLives: number },
  contracts: readonly PassportContract[],
  factors: Co2Factors
): { lives: PassportLife[]; co2AvoidedKg: number } {
  const recorded = [...contracts]
    .filter((contract) => contract.status !== 'awaiting_signature')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const unrecorded = Math.max(
    0,
    item.previousLives - recorded.filter((contract) => ended(contract.status)).length
  );
  const avoided = (number: number, condition: AssetCondition) =>
    number === 1 ? 0 : reuseEstimate(item.category, condition, 1, factors);
  const lives: PassportLife[] = [
    ...Array.from({ length: unrecorded }, (_, index) => ({
      number: index + 1,
      recorded: false,
      startDate: null,
      endDate: null,
      status: null,
      termMonths: null,
      startCondition: null,
      co2AvoidedKg: avoided(index + 1, item.condition),
    })),
    ...recorded.map((contract, index) => {
      const number = unrecorded + index + 1;
      const startCondition = conditions.includes(contract.startCondition ?? '')
        ? (contract.startCondition as AssetCondition)
        : null;
      return {
        number,
        recorded: true,
        startDate: contract.startDate,
        endDate: contract.endedOn,
        status: contract.status,
        termMonths: contract.termMonths,
        startCondition,
        co2AvoidedKg: avoided(number, startCondition ?? item.condition),
      };
    }),
  ];
  return {
    lives,
    co2AvoidedKg: Math.round(lives.reduce((sum, life) => sum + life.co2AvoidedKg, 0) * 10) / 10,
  };
}
