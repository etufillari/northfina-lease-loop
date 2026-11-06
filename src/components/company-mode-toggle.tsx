'use client';

import { COMPANY_MODE_COOKIE } from '@/company-mode';
import type { Locale } from '@/i18n/locales';

export function CompanyModeToggle({
  locale,
  active,
  labels,
}: {
  locale: Locale;
  active: boolean;
  labels: { enter: string; exit: string };
}) {
  function toggle() {
    if (active) {
      document.cookie = `${COMPANY_MODE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      window.location.assign(`/${locale}`);
      return;
    }
    document.cookie = `${COMPANY_MODE_COOKIE}=1; path=/; SameSite=Lax`;
    window.location.assign(`/${locale}/circular?view=returned`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="min-h-10 w-full rounded-lg bg-emerald-700 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      {active ? labels.exit : labels.enter}
    </button>
  );
}
