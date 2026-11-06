// Returned items waiting for their next life. Staff refurbish an item here, which makes it
// available again in the catalogue at a price based on its used value.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { RefurbishButton } from '@/components/refurbish-button';
import type { AssetCondition } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import { conditionRank } from '@/domain/second-life/second-life-matching';
import { formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets/assets';
import { db } from '@/server/db';
import { quoteRefurbishment } from '@/server/second-life/refurbishment';
import { todayIso } from '@/server/today';

/** Items must reach at least 'good' to be leased again; better items keep their condition. */
function targetConditionFor(condition: AssetCondition): AssetCondition {
  return conditionRank[condition] > conditionRank.good ? condition : 'good';
}

export default async function SecondLifePage({ params }: PageProps<'/[locale]/second-life'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Asset status is live database data.
  await connection();

  const t = getT(locale);
  const today = todayIso();
  const assets = (await listAssets(db)).filter((asset) => asset.status === 'returned');
  const items = await Promise.all(
    assets.map(async (asset) => {
      const targetCondition = targetConditionFor(asset.condition);
      return {
        asset,
        targetCondition,
        quote: await quoteRefurbishment(db, asset.id, { targetCondition }),
      };
    })
  );

  return (
    <>
      <section className="brand-hero">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="page-title max-w-2xl">{t('secondLife.title')}</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.4]">{t('secondLife.intro')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-300 p-6 text-ink-700 dark:border-ink-700 dark:text-ink-300">
            {t('secondLife.empty')}
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map(({ asset, targetCondition, quote }) => (
              <li
                key={asset.id}
                className="flex flex-col items-start rounded-2xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900"
              >
                <p className="text-sm text-ink-600 dark:text-ink-400">{asset.make}</p>
                <h2 className="text-lg font-semibold">{asset.model}</h2>
                <p className="mt-3 text-sm">
                  {t(`condition.${asset.condition}`)} ·{' '}
                  {t(`usage.${asset.usage.unit}`, {
                    value: formatNumber(asset.usage.value, locale),
                  })}
                </p>
                {quote.ok ? (
                  <>
                    <p className="mt-3 text-sm font-medium">
                      {t('secondLife.cost', {
                        amount: formatEuro(quote.quote.totalCostCents, intlLocale[locale]),
                        condition: t(`condition.${targetCondition}`),
                      })}
                    </p>
                    <RefurbishButton
                      assetId={asset.id}
                      href={`/${locale}/catalogue/${asset.category}/${asset.id}`}
                      targetCondition={targetCondition}
                      today={today}
                      label={t('secondLife.refurbish')}
                      errorLabel={t('secondLife.error')}
                    />
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-600 dark:text-ink-400">
                    {t('secondLife.unavailable')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
