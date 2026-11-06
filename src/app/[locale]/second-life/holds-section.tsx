// Holds that need staff: sets being collected for multi-item waiters (released once the
// waiter's deadline passes) and offers whose 7-day hold ran out without a lease (passed on to
// the next person in line).
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { PoolSummary } from '@/server/second-life-pools';
import type { ExpiredOffer } from '@/server/waitlist-actions';
import { DeskActionButton } from './desk-action-button';

export function HoldsSection({
  locale,
  pools,
  expiredOffers,
  personaId,
  asOfParam,
}: {
  locale: Locale;
  pools: PoolSummary[];
  expiredOffers: ExpiredOffer[];
  personaId: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  return (
    <>
      {pools.length > 0 && (
        <PoolsList locale={locale} pools={pools} personaId={personaId} asOfParam={asOfParam} />
      )}
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
                  {t('secondLife.expiredLine', {
                    id: entry.id,
                    who: entry.who,
                    assets: assetIds.join(', '),
                    date: formatIsoDate(until, locale),
                  })}
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

function PoolsList({
  locale,
  pools,
  personaId,
  asOfParam,
}: {
  locale: Locale;
  pools: PoolSummary[];
  personaId: string | null;
  asOfParam: string | null;
}) {
  const t = getT(locale);
  return (
    <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950">
      <h2 className="text-sm font-semibold">{t('secondLife.poolsTitle')}</h2>
      <ul className="mt-3 space-y-3">
        {pools.map(({ waiter, assetIds, expired }) => (
          <li key={waiter.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p>
                {t('secondLife.poolLine', {
                  id: waiter.id,
                  who: waiter.who,
                  filled: assetIds.length,
                  quantity: waiter.quantity,
                  assets: assetIds.join(', '),
                  date: formatIsoDate(waiter.needed_by, locale),
                })}
              </p>
              {expired && (
                <p className="mt-1 text-amber-900 dark:text-amber-200">
                  {t('secondLife.poolExpired')}
                </p>
              )}
            </div>
            {expired && (
              <DeskActionButton
                locale={locale}
                path={`/api/second-life/pools/${waiter.id}/release`}
                label={t('secondLife.release')}
                personaId={personaId}
                asOfParam={asOfParam}
                tone="secondary"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
