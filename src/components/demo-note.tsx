// Marks text that is about the demo itself (time travel, "Acting as", acting as the signatory)
// rather than for the customer, so nobody mistakes it for what a real customer would read.
// `DemoTag` is the small dashed "Demo" label; `DemoNote` is a dashed box that starts with it.
import type { ReactNode } from 'react';
import type { Translate } from '@/i18n/get-t';

export function DemoTag({ t }: { t: Translate }) {
  return (
    <span className="mr-2 inline-block rounded-full border border-dashed border-stone-500 px-2 py-0.5 align-middle text-xs font-semibold tracking-wide text-stone-700 uppercase dark:border-stone-400 dark:text-stone-200">
      {t('demo.tag')}
    </span>
  );
}

export function DemoNote({ t, children }: { t: Translate; children: ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-xl border border-dashed border-stone-400 bg-stone-50 p-4 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 print:hidden"
    >
      <DemoTag t={t} />
      {children}
    </p>
  );
}
