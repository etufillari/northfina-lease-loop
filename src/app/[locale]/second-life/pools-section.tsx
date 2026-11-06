// Sets being collected for multi-item waiters: what is held, for whom, until when — and, once
// the waiter's deadline has passed, a button that releases the held items to the catalogue.
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import type { PoolSummary } from '@/server/second-life-pools';
import { DeskActionButton } from './desk-action-button';

export function PoolsSection({
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
  if (pools.length === 0) return null;
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
