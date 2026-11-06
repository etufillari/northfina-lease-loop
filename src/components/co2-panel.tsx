// The item passport's circular impact: lives, CO₂ and money saved by reuse, and (for e-bikes)
// the CO₂ of riding instead of driving. The method is in src/domain/co2.ts.
import { formatEuro } from '@/domain/money';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import type { ItemImpact } from '@/server/co2';

type Co2PanelProps = { impact: ItemImpact; isEbike: boolean; locale: Locale; t: Translate };

export function Co2Panel({ impact, isEbike, locale, t }: Co2PanelProps) {
  const kg = (value: number) => formatNumber(Math.round(value), locale);
  const percent = formatNumber(Math.round(impact.lifeLeft * 100), locale);
  return (
    <section
      aria-labelledby="co2-heading"
      className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-900 dark:bg-emerald-950"
    >
      <h2 id="co2-heading" className="text-lg font-semibold">
        {t('co2.title')}
      </h2>
      <p className="mt-2 text-stone-700 dark:text-stone-300">
        {impact.reuseLives === 0
          ? t('co2.firstLife', { lives: impact.livesStarted })
          : t('co2.reused', { lives: impact.livesStarted, reuse: impact.reuseLives })}
      </p>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <Figure label={t('co2.reuseSaved')} value={t('co2.kg', { kg: kg(impact.reuseSavedKg) })} />
        <Figure
          label={t('co2.moneySaved')}
          value={formatEuro(impact.moneySavedCents, intlLocale[locale])}
        />
        {isEbike ? (
          <Figure
            label={t('co2.ridingSaved')}
            value={t('co2.kg', { kg: kg(impact.ridingSavedKg) })}
          />
        ) : null}
      </dl>

      <details className="mt-4 text-sm text-stone-700 dark:text-stone-300">
        <summary className="cursor-pointer font-medium">{t('co2.howTitle')}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            {t('co2.howPerLife', {
              newKg: kg(impact.newItemKg),
              perLife: kg(impact.perReuseLifeKg),
            })}
          </li>
          <li>{t('co2.howLifeLeft', { percent })}</li>
          <li>{t('co2.howToday')}</li>
          {isEbike ? <li>{t('co2.howRiding')}</li> : null}
        </ul>
      </details>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
