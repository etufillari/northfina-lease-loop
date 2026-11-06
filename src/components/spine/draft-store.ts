/** Browser I/O adapter. Tests supply a throwing Storage; production uses sessionStorage. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createDraftStore(storage: () => DraftStorage) {
  const memory = new Map<string, string>();
  const volatile = new Set<string>();

  return {
    snapshot(key: string): string {
      // A failed write must not be overwritten by an older value still on disk.
      if (!volatile.has(key)) {
        try {
          memory.set(key, storage().getItem(key) ?? '');
        } catch {
          volatile.add(key);
        }
      }
      // A primitive snapshot remains Object.is-stable between genuine changes.
      return `${volatile.has(key) ? '1' : '0'}:${memory.get(key) ?? ''}`;
    },
    write(key: string, raw: string): void {
      memory.set(key, raw);
      try {
        storage().setItem(key, raw);
        volatile.delete(key);
      } catch {
        // Continue in this tab, with an explicit warning about reload durability.
        volatile.add(key);
      }
    },
  };
}

export function decodeDraft<T>(
  snapshot: string,
  fallback: T,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }
): T {
  const raw = snapshot.slice(2);
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
