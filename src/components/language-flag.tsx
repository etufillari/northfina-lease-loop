import type { Locale } from '@/i18n/locales';

/** Decorative cues only; native language names are always present alongside them. */
export function LanguageFlag({ locale }: { locale: Locale }) {
  return (
    <svg className="language-flag" viewBox="0 0 24 16" aria-hidden="true" focusable="false">
      {locale === 'fi' ? (
        <>
          <path fill="#fff" d="M0 0h24v16H0z" />
          <path fill="#003580" d="M7 0h4v16H7zM0 6h24v4H0z" />
        </>
      ) : locale === 'sv' ? (
        <>
          <path fill="#006aa7" d="M0 0h24v16H0z" />
          <path fill="#fecc00" d="M7 0h3v16H7zM0 6.5h24v3H0z" />
        </>
      ) : locale === 'et' ? (
        <>
          <path fill="#fff" d="M0 0h24v16H0z" />
          <path fill="#4891d9" d="M0 0h24v5.33H0z" />
          <path fill="#000" d="M0 5.33h24v5.34H0z" />
        </>
      ) : (
        <>
          <path fill="#012169" d="M0 0h24v16H0z" />
          <path stroke="#fff" strokeWidth="4" d="m0 0 24 16M24 0 0 16" />
          <path stroke="#c8102e" strokeWidth="1.5" d="m0 0 24 16M24 0 0 16" />
          <path stroke="#fff" strokeWidth="6" d="M12 0v16M0 8h24" />
          <path stroke="#c8102e" strokeWidth="3.5" d="M12 0v16M0 8h24" />
        </>
      )}
    </svg>
  );
}
