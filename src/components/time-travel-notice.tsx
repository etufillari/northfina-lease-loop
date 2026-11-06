// Shown when time travel puts the app before something happened: a contract not signed yet,
// or an item whose later history locks it (it can be looked at, not changed, until the app is
// back at its present). `inline` renders a banner inside a page instead of a whole page.
import type { Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { DemoTag } from './demo-note';

type TimeTravelNoticeProps = { text: string; locale: Locale; t: Translate; inline?: boolean };

export function TimeTravelNotice({ text, t, inline }: TimeTravelNoticeProps) {
  const box = (
    <p
      role="note"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 print:hidden"
    >
      <DemoTag t={t} />
      <span className="font-semibold">{t('timeTravel.on')}</span> {text}
    </p>
  );
  if (inline) return <div className="mt-6">{box}</div>;
  return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">{box}</div>;
}
