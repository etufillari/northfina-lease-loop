// One waiting-list entry: what was asked for, where it stands (waiting, an offer with its rent
// and hold, an application, a lease) and what can be done.
import Link from 'next/link';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { WaitlistView } from '@/server/waitlist-views';
import { EntryActions } from './entry-actions';

const STATUS_STYLE: Record<string, string> = {
  waiting: 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100',
  offered: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  accepted: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  leased: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  removed: 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200',
};

export function EntryCard({
  locale,
  view,
  actor,
  asOfParam,
}: {
  locale: Locale;
  view: WaitlistView;
  /** The persona acting on it; null shows the entry read-only. */
  actor: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  const euro = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const { entry, offer } = view;
  const suffix = asOfParam ? `?asOf=${asOfParam}` : '';
  const status =
    entry.status === 'removed' && entry.left_reason
      ? t(`waitlist.left.${entry.left_reason}` as MessageKey)
      : t(`waitlist.status.${entry.status}` as MessageKey);

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {entry.id} · {t('waitlist.joinedOn', { date: formatIsoDate(entry.joined_on, locale) })}
          </p>
          <h3 className="font-semibold">
            {entry.quantity > 1
              ? t('waitlist.wantsMany', {
                  quantity: entry.quantity,
                  category: t(`category.${entry.category}` as MessageKey),
                })
              : t(`category.${entry.category}` as MessageKey)}
          </h3>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {entry.min_monthly_net_rent_cents > 0
              ? t('waitlist.needsRange', {
                  condition: t(`condition.${entry.min_condition}` as MessageKey),
                  min: euro(entry.min_monthly_net_rent_cents),
                  max: euro(entry.max_monthly_net_rent_cents),
                  term: entry.preferred_term_months,
                  date: formatIsoDate(entry.needed_by, locale),
                })
              : t('waitlist.needs', {
                  condition: t(`condition.${entry.min_condition}` as MessageKey),
                  budget: euro(entry.max_monthly_net_rent_cents),
                  term: entry.preferred_term_months,
                  date: formatIsoDate(entry.needed_by, locale),
                })}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLE[entry.status] ?? STATUS_STYLE.waiting}`}
        >
          {status}
        </span>
      </header>

      {entry.status === 'waiting' && (view.pastDeadline || entry.quantity > 1) && (
        <div className="mt-3 space-y-1 text-sm text-stone-600 dark:text-stone-400">
          {view.pastDeadline && <p>{t('waitlist.pastDeadline')}</p>}
          {entry.quantity > 1 && <p>{t('waitlist.manyNote', { quantity: entry.quantity })}</p>}
        </div>
      )}

      {offer && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:ring-emerald-800">
          <p className="font-medium">
            {offer.expired
              ? t('waitlist.offerExpired', { date: formatIsoDate(offer.until, locale) })
              : t('waitlist.offerUntil', { date: formatIsoDate(offer.until, locale) })}
          </p>
          <ul className="mt-2 space-y-1">
            {offer.items.map((item) => (
              <li key={item.assetId} className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/${locale}/assets/${item.assetId}/passport${suffix}`}
                  className="hover:underline"
                >
                  {item.make} {item.model} ·{' '}
                  {item.condition ? t(`condition.${item.condition}` as MessageKey) : ''}
                </Link>
                <span className="tabular-nums">
                  {item.monthlyNetRentCents !== null
                    ? t('waitlist.rent', {
                        rent: euro(item.monthlyNetRentCents),
                        term: entry.preferred_term_months,
                      })
                    : '–'}
                </span>
              </li>
            ))}
          </ul>
          {offer.items.length > 1 && (
            <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
              {t('waitlist.setNote', { quantity: offer.items.length })}
            </p>
          )}
          <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
            {t('waitlist.offerNote')}
          </p>
        </div>
      )}

      {view.applicationId && entry.status === 'accepted' && (
        <p className="mt-3 text-sm">
          <Link
            href={`/${locale}/apply/${view.applicationId}${suffix}`}
            className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {t('waitlist.continueApplication')} →
          </Link>
        </p>
      )}

      {actor && (
        <div className="mt-4">
          <EntryActions
            locale={locale}
            entryId={entry.id}
            asOfParam={asOfParam}
            actions={
              entry.status === 'waiting'
                ? ['leave']
                : entry.status === 'offered' &&
                    offer &&
                    !offer.expired &&
                    entry.customer_id === actor
                  ? ['accept', 'decline']
                  : entry.status === 'offered' || entry.status === 'accepted'
                    ? ['decline']
                    : []
            }
          />
        </div>
      )}
    </article>
  );
}
