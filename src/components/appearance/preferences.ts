export const appearanceKey = 'lease-loop-appearance-v1';
export type Design = 'green' | 'northfina';
export type Mode = 'light' | 'dark' | 'system';
export type Appearance = { design: Design; mode: Mode };
export const defaultAppearance: Appearance = { design: 'green', mode: 'system' };

/** Preferences are untrusted browser data, never CSS or markup. */
export function parseAppearance(raw: string | null): Appearance {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return { ...defaultAppearance };
    const record = value as Record<string, unknown>;
    return {
      design: record.design === 'northfina' ? 'northfina' : 'green',
      mode: record.mode === 'light' || record.mode === 'dark' ? record.mode : 'system',
    };
  } catch {
    return { ...defaultAppearance };
  }
}

/** Static, allow-listed data only. Run in the head before the page is painted. */
export const appearanceInit = `(() => {
  const root = document.documentElement;
  let value = {};
  let volatile = false;
  try {
    const saved = JSON.parse(localStorage.getItem('${appearanceKey}') || 'null');
    if (saved && typeof saved === 'object') value = saved;
  } catch { volatile = true; }
  root.dataset.design = value.design === 'northfina' ? 'northfina' : 'green';
  root.dataset.mode = value.mode === 'light' || value.mode === 'dark' ? value.mode : 'system';
  root.dataset.theme = root.dataset.mode === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : root.dataset.mode;
  root.dataset.appearanceVolatile = String(volatile);
})();`;
