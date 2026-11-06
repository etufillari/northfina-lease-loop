// Light or dark: what the person picked with the header button, kept in a cookie so the
// server can render the right colours straight away (no flash of the wrong theme). With no
// choice the app follows the device's setting (prefers-color-scheme), see globals.css.

export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'lease-loop-theme';

/** The theme stored in the cookie, or null when the person hasn't picked one. */
export function parseTheme(value: string | undefined | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** The theme in use: the person's choice, or else the device's. */
export function effectiveTheme(chosen: Theme | null, deviceIsDark: boolean): Theme {
  return chosen ?? (deviceIsDark ? 'dark' : 'light');
}

/** What the button switches to. */
export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
