// Holds that need staff: offers whose 3-day hold ran out without a lease (passed on to the
// next person in line).
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { ExpiredOffer } from '@/server/waitlist-actions';
import { DeskActionButton } from './desk-action-button';

export function HoldsSection({
  locale,
  expiredOffers,
  personaId,
  asOfParam,
}: {
  locale: Locale;
  expiredOffers: ExpiredOffer[];
  personaId: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  return (
    <>
      {expiredOffers.length > 0 && (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="text-sm font-semibold">{t('secondLife.expiredTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {expiredOffers.map(({ entry, assetIds, until }) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <p>
                  {t(
                    entry.status === 'accepted'
                      ? 'secondLife.expiredLineAccepted'
                      : 'secondLife.expiredLine',
                    {
                      id: entry.id,
                      who: entry.who,
                      assets: assetIds.join(', '),
                      date: formatIsoDate(until, locale),
                    }
                  )}
                </p>
                <DeskActionButton
                  locale={locale}
                  path={`/api/waitlist/${entry.id}/expire`}
                  label={t('secondLife.passOn')}
                  personaId={personaId}
                  asOfParam={asOfParam}
                  tone="secondary"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
