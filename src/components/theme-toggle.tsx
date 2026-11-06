'use client';

// The light/dark button next to the languages. The choice goes into a cookie (read by the
// layout, so the next page renders in the right colours) and onto <html data-theme> right
// away. Until the person picks one, the app follows the device; the button then shows the
// device's current theme.
import { useState, useSyncExternalStore } from 'react';
import { effectiveTheme, otherTheme, THEME_COOKIE, type Theme } from '@/domain/theme';

type ThemeToggleProps = {
  /** The theme from the cookie, or null when the device decides. */
  chosen: Theme | null;
  label: string;
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function ThemeToggle({ chosen: initial, label }: ThemeToggleProps) {
  const [chosen, setChosen] = useState(initial);
  // The server can't see the device's setting, so it renders as light until hydrated.
  const deviceIsDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false
  );
  const theme = effectiveTheme(chosen, deviceIsDark);

  function toggle() {
    const next = otherTheme(theme);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.theme = next;
    setChosen(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === 'dark'}
      aria-label={label}
      title={label}
      className="rounded-full bg-stone-100 p-2 text-stone-700 hover:text-stone-950 dark:bg-stone-800 dark:text-stone-300 dark:hover:text-white"
    >
      {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: 'size-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
