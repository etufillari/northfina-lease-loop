// Internal amounts are non-negative safe integer cents. BigInt prevents overflow
// while multiplying; conversion back to Number happens only after one half-up round.

function requireWhole(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be non-negative safe integer units`);
  }
}

/** Converts a decimal table value exactly: 0.027584 at six places becomes 27584. */
export function decimalToScaled(value: number, places: number): number {
  if (!Number.isInteger(places) || places < 0 || places > 6) {
    throw new RangeError('places must be an integer from 0 to 6');
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || (match[2]?.length ?? 0) > places) {
    throw new RangeError('table value has unsupported precision');
  }
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(places, '0');
  const scaled = Number(BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction || '0'));
  requireWhole(scaled, 'scaled value');
  return scaled;
}

/** Non-negative rational product, rounded once: exactly half a cent rounds up. */
export function multiplyRatio(cents: number, numerator: number, denominator: number): number {
  requireWhole(cents, 'cents');
  requireWhole(numerator, 'numerator');
  requireWhole(denominator, 'denominator');
  if (denominator === 0) throw new RangeError('denominator must be positive');

  const product = BigInt(cents) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const rounded = Number((2n * product + divisor) / (2n * divisor));
  requireWhole(rounded, 'rounded result');
  return rounded;
}

/**
 * UI boundary: accepts 12, 12.3 or 12,34; never parses euros through a float.
 * Parsed money must also fit the API and Prisma Int cap (2_147_483_647 cents =
 * €21,474,836.47). Larger amounts are ordinary `invalid_money` text, so
 * the field shows its own friendly error instead of a server VALIDATION_ERROR.
 */
export function parseCents(
  text: string
): { ok: true; cents: number } | { ok: false; reason: 'invalid_money' } {
  const value = text.trim();
  const match = value.length <= 20 ? /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value) : null;
  if (!match) return { ok: false, reason: 'invalid_money' };
  const cents = Number(BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0')));
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647
    ? { ok: true, cents }
    : { ok: false, reason: 'invalid_money' };
}
