// Canonical JSON: the one string a value hashes to (docs/features/audit-chain.md).
// Object keys sorted recursively (by UTF-16 code unit, Array#sort's default), arrays in their
// order, no whitespace, numbers and strings printed exactly as JSON.stringify prints them.
// Like JSON, an undefined object value is dropped and an undefined array item prints `null`,
// so a value and its JSON.parse(JSON.stringify(value)) round trip give the same string.

/** The canonical JSON text of `value`; throws on a value JSON cannot hold (a bigint). */
export function canonicalJson(value: unknown): string {
  return print(value) ?? 'null';
}

/** The text of `value`, or undefined where JSON.stringify would leave it out. */
function print(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'bigint') throw new TypeError('canonicalJson: a bigint is not JSON');
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (typeof value !== 'object') return JSON.stringify(value);
  const withToJson = value as { toJSON?: () => unknown };
  if (typeof withToJson.toJSON === 'function') return print(withToJson.toJSON());
  if (Array.isArray(value)) return `[${value.map((item) => print(item) ?? 'null').join(',')}]`;
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort()
    .flatMap((key) => {
      const text = print(record[key]);
      return text === undefined ? [] : [`${JSON.stringify(key)}:${text}`];
    });
  return `{${members.join(',')}}`;
}
