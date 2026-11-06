'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { z } from 'zod';
import { createDraftStore, decodeDraft } from './draft-store';

const eventName = 'lease-loop-draft-changed';
const serverSnapshot = () => '0:';
// The closure reads window only when the client invokes it, never during SSR.
const store = createDraftStore(() => window.sessionStorage);

function subscribe(listener: () => void): () => void {
  window.addEventListener(eventName, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Third result means this key currently survives only in the mounted browser tab. */
export function useDraft<T>(
  key: string,
  fallback: T,
  schema: z.ZodType<T>
): [T, (next: T) => void, boolean] {
  const read = useCallback(() => store.snapshot(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, read, serverSnapshot);
  const value = decodeDraft(snapshot, fallback, schema);
  const save = (next: T) => {
    store.write(key, JSON.stringify(next));
    window.dispatchEvent(new Event(eventName));
  };
  return [value, save, snapshot.startsWith('1:')];
}
