'use client';

import { useEffect, useRef } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { useAppearance } from './use-appearance';

export function AppearanceSwitcher({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const { appearance, save, ready, volatile } = useAppearance(locale);
  const menuRef = useRef<HTMLDetailsElement>(null);

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
    <details
      ref={menuRef}
      className="appearance"
      onBlur={(event) => {
        // Clicking a label briefly blurs to null before its input receives focus.
        // Keep the menu open during that native focus transfer (Chrome can crash).
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.currentTarget.querySelector('summary')?.focus();
        event.currentTarget.open = false;
      }}
    >
      <summary className="appearance-trigger">
        <span className="appearance-icon" aria-hidden="true" />
        {t('appearance.title')}
      </summary>
      <div className="appearance-panel">
        <fieldset disabled={!ready}>
          <legend>{t('appearance.design')}</legend>
          <div className="appearance-options">
            {(['green', 'northfina'] as const).map((design) => (
              <label key={design} className="appearance-choice">
                <input
                  type="radio"
                  name="appearance-design"
                  value={design}
                  checked={appearance.design === design}
                  onChange={() => save({ ...appearance, design })}
                />
                <span className="appearance-swatch" data-swatch={design} aria-hidden="true" />
                {t(`appearance.${design}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={!ready} className="mt-4">
          <legend>{t('appearance.mode')}</legend>
          <div className="appearance-options">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <label key={mode} className="appearance-choice">
                <input
                  type="radio"
                  name="appearance-mode"
                  value={mode}
                  checked={appearance.mode === mode}
                  onChange={() => save({ ...appearance, mode })}
                />
                {t(`appearance.${mode}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {volatile ? (
          <p role="status" className="ui-note mt-3">
            {t('appearance.storageWarning')}
          </p>
        ) : null}
      </div>
    </details>
  );
}
