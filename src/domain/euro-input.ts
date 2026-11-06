// Turning a typed euro amount into integer cents, exactly: "45", "45,5", "45.50" → 4550.
// No floating point: the euros and the cents are parsed as separate whole numbers.

/** A positive euro amount with at most two decimals (comma or point) → cents; else null. */
export function euroInputToCents(value: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

/**
 * Like `euroInputToCents`, but a well-formed amount over the cap (up to 15 digits of euros)
 * is clamped to `maxCents` instead of being refused — so a huge budget still saves.
 */
export function euroInputToCentsClamped(value: string, maxCents: number): number | null {
  const match = /^(\d{1,15})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
  if (cents <= 0) return null;
  return Math.min(cents, maxCents);
}
