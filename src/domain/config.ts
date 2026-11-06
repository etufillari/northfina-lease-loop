// Tunable business numbers (ARCHITECTURE.md §10.3). Plain constants: functions take them
// as arguments (defaulting to these), so tests and surprise scenarios can turn them.
// Rates, bands and thresholds that exist in data/ keep coming from the data files; the
// minimum age, for example, comes from `blocks_application_when` in questions.json.
import type { AssetCondition } from '@/data/schemas';

export type LeaseConfig = {
  /** Share of monthly net income a consumer may spend on rent incl. VAT, in percent. */
  affordabilityPercent: number;
  /** Lowest condition a returned item may be relisted at without a waiting-list exception. */
  minimumRelistCondition: AssetCondition;
  /** Down payment slider step, net cents. */
  downPaymentStepCents: number;
};

export const LEASE_CONFIG: Readonly<LeaseConfig> = Object.freeze({
  affordabilityPercent: 30,
  minimumRelistCondition: 'good',
  downPaymentStepCents: 5_000, // €50
});
