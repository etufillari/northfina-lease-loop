'use client';

// "Acting as": pick a guest, one of the data pack's customers, or staff. A demo stand-in for
// logging in: it pre-fills that customer's answers and shows only their contracts. The choice
// is a cookie in this browser (see src/server/viewer.ts); it is not security.
import { useRouter } from 'next/navigation';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { STAFF, VIEWER_COOKIE } from '@/server/viewer';

type CustomerSwitcherProps = {
  customers: { id: string; name: string; type: string }[];
  /** The current choice: a customer id, "staff", or "" for a guest. */
  current: string;
  locale: Locale;
};

export function CustomerSwitcher({ customers, current, locale }: CustomerSwitcherProps) {
  const t = getT(locale);
  const router = useRouter();

  function choose(value: string) {
    document.cookie = value
      ? `${VIEWER_COOKIE}=${value}; path=/; samesite=lax`
      : `${VIEWER_COOKIE}=; path=/; max-age=0; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-stone-700 dark:text-stone-300">{t('viewer.label')}</span>
      <select
        value={current}
        onChange={(event) => choose(event.target.value)}
        className="max-w-[12rem] rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
      >
        <option value="">{t('viewer.guest')}</option>
        <optgroup label={t('viewer.customers')}>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </optgroup>
        <option value={STAFF}>{t('viewer.staff')}</option>
      </select>
    </label>
  );
}
