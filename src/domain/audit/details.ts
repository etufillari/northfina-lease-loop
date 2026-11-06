// The audit page's Details column (docs/features/audit-chain.md): a stored details value,
// any JSON, as one line per leaf field instead of a printed object.
//   { reasons: [{ code: 'x' }] }  →  [{ path: 'reasons.1.code', value: 'x' }]
// Paths join keys with dots and count array items from 1; an empty object or array is a dash.

export type AuditDetailLine = { path: string; value: string };

const EMPTY = '—';

function join(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`;
}

function walk(value: unknown, path: string, out: AuditDetailLine[]): void {
  if (Array.isArray(value)) {
    if (value.length === 0) out.push({ path, value: EMPTY });
    value.forEach((item, index) => walk(item, join(path, String(index + 1)), out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) out.push({ path, value: EMPTY });
    for (const [key, item] of entries) walk(item, join(path, key), out);
    return;
  }
  out.push({ path, value: typeof value === 'string' ? value : String(value) });
}

/** One line per leaf of `details`; none for an entry without details. */
export function auditDetailLines(details: unknown): AuditDetailLine[] {
  if (details === null || details === undefined) return [];
  const out: AuditDetailLine[] = [];
  walk(details, '', out);
  return out;
}
