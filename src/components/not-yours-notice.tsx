// Shown instead of an application or contract that belongs to someone else. This demo has no
// real login, so it says whose it is and how to switch to them (see src/server/viewer.ts).
import Link from 'next/link';
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type NotYoursNoticeProps = { ownerName: string | null; locale: Locale; t: Translate };

export function NotYoursNotice({ ownerName, locale, t }: NotYoursNoticeProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-xl font-semibold">{t('viewer.notYoursTitle')}</h1>
        <p className="mt-2 text-stone-700 dark:text-stone-300">
          {ownerName ? t('viewer.notYoursOwner', { name: ownerName }) : t('viewer.notYoursGuest')}
        </p>
        <Link
          href={`/${locale}/contracts`}
          className="mt-4 inline-block text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
        >
          {t('contracts.backToList')}
        </Link>
      </section>
    </div>
  );
}
