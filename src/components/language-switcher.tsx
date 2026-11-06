'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { localeNames, locales, type Locale } from '@/i18n/locales';
import { LanguageFlag } from './language-flag';

/** Native disclosure and document navigation keep language, query and hash together. */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.split('/').slice(2).join('/');
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuId = useId();
  const [suffix, setSuffix] = useState('');

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, []);

  return (
    <nav aria-label={label} className="language-switcher">
      <details
        ref={menuRef}
        className="language-disclosure"
        onToggle={(event) => {
          // Read URL extras only after opening, keeping server/client markup identical.
          if (event.currentTarget.open) setSuffix(window.location.search + window.location.hash);
        }}
        onBlur={(event) => {
          // Ignore transient null focus transfers, as in the appearance menu fix.
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.open = false;
          }
        }}
        onKeyDown={(event) => {
          const menu = event.currentTarget;
          const trigger = menu.querySelector('summary');
          if (event.key === 'Escape' && menu.open) {
            event.preventDefault();
            event.stopPropagation();
            trigger?.focus();
            menu.open = false;
            return;
          }
          const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          if (!menu.open && !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          event.preventDefault();
          menu.open = true;
          const links = Array.from(menu.querySelectorAll<HTMLAnchorElement>('a[lang]'));
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? links.length - 1
                : event.key === 'ArrowDown'
                  ? (index + 1) % links.length
                  : index <= 0
                    ? links.length - 1
                    : index - 1;
          links[next]?.focus();
        }}
      >
        <summary
          className="language-trigger"
          aria-controls={menuId}
          aria-label={`${label}: ${current.toUpperCase()} — ${localeNames[current]}`}
        >
          <svg
            className="language-globe"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18M5 6.5h14M5 17.5h14" />
          </svg>
          <span aria-hidden="true">{current.toUpperCase()}</span>
          <svg
            className="language-chevron"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </summary>
        <ul id={menuId} className="language-menu">
          {locales.map((locale) => {
            const active = locale === current;
            return (
              <li key={locale}>
                <a
                  href={(rest ? `/${locale}/${rest}` : `/${locale}`) + suffix}
                  hrefLang={locale}
                  lang={locale}
                  aria-current={active ? 'page' : undefined}
                  className="language-option"
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
                      return;
                    const menu = menuRef.current;
                    if (!menu) return;
                    menu.querySelector('summary')?.focus();
                    menu.open = false;
                  }}
                >
                  <LanguageFlag locale={locale} />
                  <span>{localeNames[locale]}</span>
                  <svg
                    className="language-check"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                    focusable="false"
                  >
                    {active ? <path d="m4 10 4 4 8-8" /> : null}
                  </svg>
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}
