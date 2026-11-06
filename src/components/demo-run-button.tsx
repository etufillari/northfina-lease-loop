'use client';

// One click per scenario step: set the demo date (D-030), then open where the card starts, or stay
// and refresh when there is no page to open (D-058). The server validates the date as always.
import { StatusMessage, useAsOf } from '@/components/as-of-control';
import type { Locale } from '@/i18n/locales';

export function DemoRunButton({
  locale,
  asOf,
  href,
  label,
  variant = 'primary',
}: {
  locale: Locale;
  asOf: string;
  /** Where to go once the date is set; without it the current page refreshes. */
  href?: string;
  label: string;
  variant?: 'primary' | 'ghost';
}) {
  // A full page load, not router.push: the layout (demo-date banner, header date) must re-render
  // with the new date too, and a client-side push keeps the old layout.
  const { status, set } = useAsOf(href ? () => window.location.assign(href) : undefined);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={variant === 'primary' ? 'btn-primary px-4 py-1.5' : 'btn-ghost px-3 py-1.5'}
        disabled={status === 'busy'}
        onClick={() => void set(asOf)}
      >
        {label}
      </button>
      <StatusMessage status={status} locale={locale} />
    </span>
  );
}
