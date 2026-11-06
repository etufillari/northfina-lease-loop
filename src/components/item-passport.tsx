import type { AssetCategory, AssetCondition } from '@/data/schemas';
import { loadCo2Factors } from '@/data/load';
import { itemPassport } from '@/domain/item-passport';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT, type MessageKey } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { db } from '@/server/db';

/**
 * Card 10: every life of a used item and the CO₂ its reuse has avoided. Only dates, terms and
 * conditions are shown; never who leased it.
 */
export async function ItemPassport({
  asset,
  locale,
}: {
  asset: { id: string; category: AssetCategory; condition: AssetCondition; previous_lives: number };
  locale: Locale;
}) {
  const [contracts, factors] = await Promise.all([
    db.contract.findMany({
      where: { assetId: asset.id },
      select: {
        startDate: true,
        endedOn: true,
        status: true,
        termMonths: true,
        startCondition: true,
      },
    }),
    loadCo2Factors(),
  ]);
  const passport = itemPassport(
    { category: asset.category, condition: asset.condition, previousLives: asset.previous_lives },
    contracts,
    factors
  );
  // A new item on its first life has no history worth a passport yet.
  if (passport.lives.length < 2 && asset.previous_lives === 0) return null;
  const t = getT(locale);
  const kg = (value: number) => formatNumber(value, locale);
  return (
    <section aria-labelledby="passport-title" className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6">
      <div className="rounded-lg border border-hairline p-6">
        <p className="text-caption font-semibold text-primary">{t('passport.label')}</p>
        <h2 id="passport-title" className="mt-2 text-tagline font-semibold">
          {t('passport.title', { count: Math.max(passport.lives.length, asset.previous_lives) })}
        </h2>
        <p className="mt-3 text-body">{t('passport.saved', { kg: kg(passport.co2AvoidedKg) })}</p>
        <ol className="mt-5 divide-y divide-divider">
          {passport.lives.map((life) => (
            <li key={life.number} className="flex flex-wrap justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{t('passport.life', { number: life.number })}</p>
                <p className="mt-1 text-caption text-ink-muted">
                  {life.startDate
                    ? [
                        life.endDate
                          ? `${formatIsoDate(life.startDate, locale)} – ${formatIsoDate(life.endDate, locale)}`
                          : t('passport.since', { date: formatIsoDate(life.startDate, locale) }),
                        life.termMonths ? t('product.months', { count: life.termMonths }) : null,
                        life.startCondition
                          ? t('passport.startedIn', {
                              condition: t(`condition.${life.startCondition}`).toLowerCase(),
                            })
                          : null,
                        life.status ? t(`passport.status.${life.status}` as MessageKey) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : t('passport.beforeRecords')}
                </p>
              </div>
              <p className="text-caption font-semibold">
                {life.number === 1
                  ? t('passport.madeNew')
                  : t('passport.avoided', { kg: kg(life.co2AvoidedKg) })}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-fine text-ink-muted">
          {t('passport.method', {
            newKg: kg(factors.manufacturing_new_kg[asset.category]),
            share: kg(factors.refurbishment_share_of_new * 100),
          })}
        </p>
      </div>
    </section>
  );
}
