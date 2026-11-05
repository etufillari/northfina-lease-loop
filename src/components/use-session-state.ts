'use client';

// State that survives a language switch (which loads the page again) without going into the
// URL: form answers include personal details, so they stay in this tab's sessionStorage and
// disappear when the tab is closed. If storage is blocked (some private windows), the value
// lives in memory instead and the form still works.
import { useCallback, useMemo, useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'lease-loop:session-state';
const PREFIX = 'lease-loop:';
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, value);
  } catch {
    memory.set(key, value);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Like useState, but kept in sessionStorage under `key`. The server and the first browser
 * render use `initial`; the saved value appears right after the page loads.
 */
export function useSessionState<T>(
  key: string,
  initial: T
): [T, (next: T | ((current: T) => T)) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (event: Event) => {
        if (!(event instanceof CustomEvent) || event.detail === key) onChange();
      };
      window.addEventListener(CHANGE_EVENT, handler);
      window.addEventListener('storage', handler);
      return () => {
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener('storage', handler);
      };
    },
    [key]
  );

  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null
  );
  const value = useMemo(() => parse(raw, initial), [raw, initial]);

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = parse(read(key), initial);
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
      write(key, JSON.stringify(resolved));
    },
    [key, initial]
  );

  return [value, setValue];
}
