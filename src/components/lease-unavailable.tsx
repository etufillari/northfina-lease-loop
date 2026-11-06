// Says kindly why an item cannot be leased right now.
import type { Translate } from '@/i18n/get-t';

type LeaseUnavailableProps = {
  reason: 'reserved' | 'returned' | 'no_price' | 'below_minimum';
  /** The smallest amount we finance, already formatted. */
  minimum: string;
  t: Translate;
};

export function LeaseUnavailable({ reason, minimum, t }: LeaseUnavailableProps) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
      <h2 className="font-semibold">{t('price.unavailable.title')}</h2>
      <p className="mt-1 text-stone-700 dark:text-stone-300">
        {t(`price.unavailable.${reason}`, { minimum })}
      </p>
    </section>
  );
}
