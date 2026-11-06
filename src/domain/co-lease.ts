export type CoLeaseShare = {
  userId: string;
  percent: number;
  isHolder: boolean;
  effectiveFrom: string;
};

export const maxCoLeaseParticipants = 5;

export type ShareProblem = 'no_holder' | 'too_many' | 'duplicate' | 'invalid_percent' | 'not_100';

/** Whole percentages only: at least 1 % each, exactly one holder, totalling exactly 100 %. */
export function shareProblem(
  shares: readonly { userId: string; percent: number; isHolder: boolean }[]
): ShareProblem | null {
  if (shares.filter((share) => share.isHolder).length !== 1) return 'no_holder';
  if (shares.length > maxCoLeaseParticipants) return 'too_many';
  if (new Set(shares.map((share) => share.userId)).size !== shares.length) return 'duplicate';
  if (shares.some((share) => !Number.isInteger(share.percent) || share.percent < 1))
    return 'invalid_percent';
  return shares.reduce((sum, share) => sum + share.percent, 0) === 100 ? null : 'not_100';
}

/** The version in force on a date, holder first. Empty means the lease was not shared yet. */
export function sharesOn<T extends CoLeaseShare>(rows: readonly T[], date: string): T[] {
  const version = rows.reduce(
    (latest, row) =>
      row.effectiveFrom <= date && row.effectiveFrom > latest ? row.effectiveFrom : latest,
    ''
  );
  return rows
    .filter((row) => row.effectiveFrom === version)
    .sort((a, b) => Number(b.isHolder) - Number(a.isHolder) || a.userId.localeCompare(b.userId));
}

/**
 * Divides whole cents by percentage so the parts always add up exactly. Everyone is rounded down,
 * then each leftover cent goes to the largest remainder, with ties going to whoever is listed first.
 */
export function splitCents(cents: number, percents: readonly number[]): number[] {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Invalid amount');
  if (percents.reduce((sum, percent) => sum + percent, 0) !== 100)
    throw new RangeError('Shares must total 100');
  const parts = percents.map((percent) => Math.floor((cents * percent) / 100));
  const remainders = percents
    .map((percent, index) => ({ index, remainder: (cents * percent) % 100 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const leftover = cents - parts.reduce((sum, part) => sum + part, 0);
  for (const { index } of remainders.slice(0, leftover)) parts[index]! += 1;
  return parts;
}

/** What the holder pays of an amount due on a date; all of it when the lease is not shared. */
export function holderShareCents(cents: number, rows: readonly CoLeaseShare[], date: string) {
  const shares = sharesOn(rows, date);
  if (!shares.length) return cents;
  return splitCents(
    cents,
    shares.map((share) => share.percent)
  )[0]!;
}
