import type { AssetCondition } from '@/data/schemas';
import type { MatchCandidate } from './second-life-matching';

/** Operators may override priority, but never the customer's eligibility constraints. */
export function selectSecondLifeCandidate<T extends MatchCandidate>(
  preview: { candidates: readonly T[]; recommendation: T | null },
  selection: { requestId: string; condition: AssetCondition; overrideReason?: string }
): { ok: true; candidate: T; override: boolean } | { ok: false; reason: string } {
  const candidate = preview.candidates.find(
    (row) => row.requestId === selection.requestId && row.condition === selection.condition
  );
  if (!candidate || candidate.reasons.length > 0) return { ok: false, reason: 'ineligible' };
  const override =
    preview.recommendation?.requestId !== candidate.requestId ||
    preview.recommendation?.condition !== candidate.condition;
  if (override && (!selection.overrideReason || selection.overrideReason.trim().length < 10)) {
    return { ok: false, reason: 'override_reason_required' };
  }
  return { ok: true, candidate, override };
}
